/** Extrai anexos (PDF / Word / Excel / texto) → Markdown sanitizado na Edge. */

import {
  finalizeDocumentMarkdown,
  tsvToMarkdownTable,
} from "./document-sanitize.ts";

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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function wrapDocument(name: string, markdown: string, note?: string): string {
  const header = `# ${name.replace(/\.[^.]+$/, "") || name}`;
  const body = note ? `${note}\n\n${markdown}` : markdown;
  return `${header}\n\n${body}`;
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
    const mammoth = await import("https://esm.sh/mammoth@1.8.0");
    const m = (mammoth as unknown as { default?: typeof mammoth }).default ?? mammoth;
    const ab = toArrayBuffer(bytes);
    const res = await (m as unknown as { convertToMarkdown: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }).convertToMarkdown({ arrayBuffer: ab });
    const raw = (res.value ?? "").trim();
    if (!raw) {
      return wrapDocument(name, "_Documento Word vazio._");
    }
    const { markdown } = finalizeDocumentMarkdown(raw, { structure: false });
    return wrapDocument(name, markdown, "_Fonte: Word (.docx) → Markdown._");
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
      wb.SheetNames.length > 6
        ? `\n\n_… ${wb.SheetNames.length - 6} aba(s) omitidas_`
        : "";
    return wrapDocument(
      name,
      markdown + extra,
      `_Fonte: Excel, ${Math.min(wb.SheetNames.length, 6)} aba(s) em tabelas Markdown._`,
    );
  } catch (e) {
    return `[Excel ${name}: falha ao extrair — ${(e as Error).message}]`;
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
  if (
    mime.includes("word") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".doc")
  ) {
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