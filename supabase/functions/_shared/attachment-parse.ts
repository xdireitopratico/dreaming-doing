/** Extrai texto de PDF / Word / Excel no Edge (Deno). */

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

async function parsePdf(bytes: Uint8Array, name: string): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.11.0");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const t = (text ?? "").trim();
    if (t) return t.slice(0, 48_000);
    return `[PDF ${name}: sem texto extraível]`;
  } catch (e) {
    return `[PDF ${name}: falha ao extrair — ${(e as Error).message}]`;
  }
}

async function parseDocx(bytes: Uint8Array, name: string): Promise<string> {
  try {
    const mammoth = await import("https://esm.sh/mammoth@1.8.0");
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const res = await mammoth.extractRawText({ arrayBuffer: ab });
    const t = (res.value ?? "").trim();
    if (t) return t.slice(0, 48_000);
    return `[Word ${name}: documento vazio]`;
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
      const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t" });
      chunks.push(`## Planilha: ${sheetName}\n${csv}`);
    }
    const joined = chunks.join("\n\n").trim();
    if (joined) return joined.slice(0, 48_000);
    return `[Excel ${name}: planilhas vazias]`;
  } catch (e) {
    return `[Excel ${name}: falha ao extrair — ${(e as Error).message}]`;
  }
}

export async function parseFileBlobPart(part: BlobPart): Promise<string> {
  const bytes = b64ToBytes(part.dataBase64);
  const mime = part.mimeType.toLowerCase();
  const name = part.name;

  if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    return parsePdf(bytes, name);
  }
  if (
    mime.includes("word") ||
    name.toLowerCase().endsWith(".docx") ||
    name.toLowerCase().endsWith(".doc")
  ) {
    return parseDocx(bytes, name);
  }
  if (
    mime.includes("sheet") ||
    mime.includes("excel") ||
    name.toLowerCase().endsWith(".xlsx") ||
    name.toLowerCase().endsWith(".xls")
  ) {
    return parseXlsx(bytes, name);
  }

  return `[Anexo ${name}: formato não suportado para extração automática]`;
}