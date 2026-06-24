/** Extrai anexos (PDF / Word / Excel / texto) → Markdown sanitizado na Edge. */

import { finalizeDocumentMarkdown, tsvToMarkdownTable } from "./document-sanitize.ts";

type BlobPart = {
  type: "file_blob";
  name: string;
  mimeType: string;
  dataBase64: string;
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function wrapDocument(name: string, markdown: string, note?: string): string {
  const header = `# ${name.replace(/\.[^.]+$/, "") || name}`;
  const body = note ? `${note}\n\n${markdown}` : markdown;
  return `${header}\n\n${body}`;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

async function parsePdf(bytes: Uint8Array, name: string): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.11.0");
    const pdf = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const raw = (text ?? "").trim();
    if (!raw) {
      return wrapDocument(
        name,
        "_Nenhum texto extraível — o PDF pode ser escaneado (OCR não disponível na Edge)._",
      );
    }

    const { markdown, meta } = finalizeDocumentMarkdown(raw, { structure: true });
    const pagesNote =
      typeof totalPages === "number" && totalPages > 0
        ? `_Fonte: PDF, ${totalPages} página(s).${meta.truncated ? " Conteúdo truncado." : ""}_`
        : undefined;
    return wrapDocument(name, markdown, pagesNote);
  } catch (e) {
    return `[PDF ${name}: falha ao extrair — ${(e as Error).message}]`;
  }
}

async function parseDocx(bytes: Uint8Array, name: string): Promise<string> {
  try {
    const JSZipModule = (await import("https://esm.sh/jszip@3.10.1")) as unknown as {
      default: {
        loadAsync: (input: Uint8Array) => Promise<{
          files: Record<string, unknown>;
          file: (path: string) => { async: (type: "string") => Promise<string> } | null;
        }>;
      };
    };
    const zip = await JSZipModule.default.loadAsync(bytes);
    const xmlPaths = Object.keys(zip.files)
      .filter((path) => /^word\/(document|header\d+|footer\d+)\.xml$/i.test(path))
      .sort();

    const paragraphs: string[] = [];
    for (const xmlPath of xmlPaths) {
      const xml = await zip.file(xmlPath)?.async("string");
      if (!xml) continue;

      const blocks = Array.from(
        xml.matchAll(/<w:p\b[\s\S]*?>([\s\S]*?)<\/w:p>/gi) as IterableIterator<RegExpMatchArray>,
      );

      for (const block of blocks) {
        const body = (block[1] ?? "")
          .replace(/<w:tab\/>/gi, "\t")
          .replace(/<w:br\/>/gi, "\n")
          .replace(/<w:cr\/>/gi, "\n");
        const text = Array.from(
          body.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi) as IterableIterator<RegExpMatchArray>,
        )
          .map((match) => decodeXmlEntities(match[1] ?? ""))
          .join("")
          .trim();
        if (text) paragraphs.push(text);
      }
    }

    const raw = paragraphs.join("\n\n").trim();
    if (!raw) {
      return wrapDocument(name, "_Documento Word vazio._");
    }
    const { markdown, meta } = finalizeDocumentMarkdown(raw, { structure: true });
    const note = `_Fonte: Word (.docx).${meta.truncated ? " Conteudo truncado." : ""}_`;
    return wrapDocument(name, markdown, note);
  } catch (e) {
    return `[Word ${name}: falha ao extrair — ${(e as Error).message}]`;
  }
}

async function parseXlsx(bytes: Uint8Array, name: string): Promise<string> {
  try {
    const XLSX = await import("https://esm.sh/xlsx@0.18.5");
    const wb = XLSX.read(bytes, { type: "array" });
    const chunks: string[] = [];

    for (const sheetName of wb.SheetNames.slice(0, 6)) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const tsv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t" });
      const table = tsvToMarkdownTable(tsv);
      chunks.push(`## ${sheetName}\n\n${table}`);
    }

    const joined = chunks.join("\n\n").trim();
    if (!joined) {
      return wrapDocument(name, "_Planilhas vazias._");
    }
    const { markdown } = finalizeDocumentMarkdown(joined, { structure: false });
    const extra =
      wb.SheetNames.length > 6 ? `\n\n_… ${wb.SheetNames.length - 6} aba(s) omitidas_` : "";
    return wrapDocument(
      name,
      markdown + extra,
      `_Fonte: Excel, ${Math.min(wb.SheetNames.length, 6)} aba(s) em tabelas Markdown._`,
    );
  } catch (e) {
    return `[Excel ${name}: falha ao extrair — ${(e as Error).message}]`;
  }
}

async function parsePptx(bytes: Uint8Array, name: string): Promise<string> {
  try {
    const JSZipModule = (await import("https://esm.sh/jszip@3.10.1")) as unknown as {
      default: {
        loadAsync: (input: Uint8Array) => Promise<{
          files: Record<string, unknown>;
          file: (path: string) => { async: (type: "string") => Promise<string> } | null;
        }>;
      };
    };
    const zip = await JSZipModule.default.loadAsync(bytes);
    const slidePaths = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
      .sort((a, b) => {
        const aNum = Number.parseInt(a.match(/slide(\d+)\.xml$/i)?.[1] ?? "0", 10);
        const bNum = Number.parseInt(b.match(/slide(\d+)\.xml$/i)?.[1] ?? "0", 10);
        return aNum - bNum;
      });

    if (!slidePaths.length) {
      return wrapDocument(name, "_Apresentacao PowerPoint sem slides legiveis._");
    }

    const sections: string[] = [];
    for (const [index, slidePath] of slidePaths.entries()) {
      const xml = await zip.file(slidePath)?.async("string");
      if (!xml) continue;

      const textRuns = Array.from(
        xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi) as IterableIterator<RegExpMatchArray>,
      )
        .map((match) => decodeXmlEntities(match[1] ?? "").trim())
        .filter(Boolean);

      const slideBody = textRuns.length ? textRuns.join("\n") : "_Slide sem texto extraivel._";
      sections.push(`## Slide ${index + 1}\n\n${slideBody}`);
    }

    const joined = sections.join("\n\n").trim();
    const { markdown, meta } = finalizeDocumentMarkdown(joined, { structure: false });
    const note = `_Fonte: PowerPoint (.pptx), ${slidePaths.length} slide(s).${
      meta.truncated ? " Conteudo truncado." : ""
    }_`;
    return wrapDocument(name, markdown, note);
  } catch (e) {
    return `[PowerPoint ${name}: falha ao extrair — ${(e as Error).message}]`;
  }
}

async function parsePlainText(bytes: Uint8Array, name: string): Promise<string> {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const raw = decoder.decode(bytes).trim();
  if (!raw) return wrapDocument(name, "_Arquivo de texto vazio._");
  const { markdown } = finalizeDocumentMarkdown(raw, { structure: true });
  return wrapDocument(name, markdown);
}

export async function parseFileBlobPart(part: BlobPart): Promise<string> {
  const bytes = b64ToBytes(part.dataBase64);
  const mime = part.mimeType.toLowerCase();
  const name = part.name;
  const lower = name.toLowerCase();

  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    return parsePdf(bytes, name);
  }
  if (mime.includes("word") || lower.endsWith(".docx") || lower.endsWith(".doc")) {
    return parseDocx(bytes, name);
  }
  if (
    mime.includes("sheet") ||
    mime.includes("excel") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls")
  ) {
    return parseXlsx(bytes, name);
  }
  if (mime.includes("presentation") || mime.includes("powerpoint") || lower.endsWith(".pptx")) {
    return parsePptx(bytes, name);
  }
  if (
    mime.startsWith("text/") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".csv")
  ) {
    return parsePlainText(bytes, name);
  }

  return `[Anexo ${name}: formato não suportado para extração automática]`;
}
