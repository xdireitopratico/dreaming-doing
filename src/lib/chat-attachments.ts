/** Anexos do composer → parts gravados em `messages.parts`. */

export type StoredMessagePart =
  | { type: "text"; text: string }
  | {
      type: "image";
      name: string;
      mimeType: string;
      dataBase64: string;
    }
  | {
      type: "file_blob";
      name: string;
      mimeType: string;
      dataBase64: string;
    };

const MAX_FILES = 8;
const MAX_BYTES = 3 * 1024 * 1024;

const ACCEPT = {
  extensions: [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".csv",
    ".txt",
    ".md",
    ".json",
  ],
  mimePrefixes: ["image/", "text/"],
  mimeExact: new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/json",
  ]),
};

export function isAcceptedAttachment(file: File): boolean {
  const name = file.name.toLowerCase();
  if (ACCEPT.extensions.some((ext) => name.endsWith(ext))) return true;
  if (ACCEPT.mimePrefixes.some((p) => file.type.startsWith(p))) return true;
  return ACCEPT.mimeExact.has(file.type);
}

export function filterAcceptedFiles(files: File[]): { accepted: File[]; rejected: string[] } {
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const f of files) {
    if (!isAcceptedAttachment(f)) {
      rejected.push(f.name);
      continue;
    }
    if (f.size > MAX_BYTES) {
      rejected.push(`${f.name} (máx. 3 MB)`);
      continue;
    }
    accepted.push(f);
  }
  return { accepted, rejected };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error(`Falha ao ler ${file.name}`));
    r.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error(`Falha ao ler ${file.name}`));
    r.readAsText(file);
  });
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = String(r.result ?? "");
      const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
      resolve(b64);
    };
    r.onerror = () => reject(new Error(`Falha ao ler ${file.name}`));
    r.readAsDataURL(file);
  });
}

function isImage(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name);
}

function isPlainText(file: File): boolean {
  return (
    file.type.startsWith("text/") ||
    /\.(txt|md|json|csv)$/i.test(file.name) ||
    file.type === "application/json"
  );
}

function isBinaryDoc(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    /\.pdf$/i.test(file.name) ||
    file.type.includes("word") ||
    /\.docx?$/i.test(file.name) ||
    file.type.includes("sheet") ||
    file.type.includes("excel") ||
    /\.xlsx?$/i.test(file.name)
  );
}

/** Converte arquivos do composer em parts persistidas (parse pesado no agent-run). */
export async function filesToMessageParts(files: File[]): Promise<StoredMessagePart[]> {
  const slice = files.slice(0, MAX_FILES);
  const parts: StoredMessagePart[] = [];

  for (const file of slice) {
    if (isImage(file)) {
      const dataUrl = await readAsDataUrl(file);
      const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
      parts.push({
        type: "image",
        name: file.name,
        mimeType: file.type || "image/png",
        dataBase64: b64,
      });
      continue;
    }

    if (isPlainText(file)) {
      const text = await readAsText(file);
      const trimmed = text.length > 48_000 ? `${text.slice(0, 48_000)}\n…[truncado]` : text;
      parts.push({
        type: "text",
        text: `--- Anexo: ${file.name} ---\n${trimmed}`,
      });
      continue;
    }

    if (isBinaryDoc(file)) {
      const dataBase64 = await readAsBase64(file);
      parts.push({
        type: "file_blob",
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        dataBase64,
      });
    }
  }

  return parts;
}

export function buildOutgoingParts(
  text: string,
  attachmentParts: StoredMessagePart[],
): StoredMessagePart[] {
  const out: StoredMessagePart[] = [];
  const t = text.trim();
  if (t) out.push({ type: "text", text: t });
  out.push(...attachmentParts);
  return out;
}

export const CHAT_ATTACHMENT_ACCEPT =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
