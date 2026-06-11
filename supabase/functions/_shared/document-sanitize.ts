/** Camada 1: normaliza texto/Markdown extraído de anexos para o LLM. */

export const MAX_DOCUMENT_CHARS = 48_000;

export type SanitizeMeta = {
  truncated: boolean;
  originalChars: number;
  outputChars: number;
};

/** Remove ruído típico de PDF/Word/OCR antes de enviar ao modelo. */
export function sanitizeDocumentMarkdown(raw: string): string {
  let s = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Caracteres de controle (exceto \n \t)
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

  // Ligaturas comuns
  s = s
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00A0/g, " ");

  // Cabeçalhos/rodapés de página
  s = s.replace(/^(?:Página|Page)\s+\d+\s+(?:de|of)\s+\d+\s*$/gim, "");
  s = s.replace(/^\s*-\s*\d+\s*-\s*$/gm, "");

  // Quebra de linha com hífen (palavra-\ncontinuação)
  s = s.replace(/([A-Za-zÀ-ÿ])-\n([a-zà-ÿ])/g, "$1$2");

  // Espaços em branco excessivos
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[ \t]{2,}/g, " ");

  return s.trim();
}

/** Heurística leve: linhas curtas isoladas viram `##` (PDF/texto sem estrutura). */
export function structurePlainTextAsMarkdown(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }

    const prevBlank = i === 0 || !lines[i - 1]?.trim();
    const nextBlank = i === lines.length - 1 || !lines[i + 1]?.trim();
    const looksLikeTitle =
      line.length <= 90 &&
      prevBlank &&
      nextBlank &&
      ((line === line.toUpperCase() && /[A-ZÀ-Ú]/.test(line)) ||
        /^(\d+(\.\d+)*[.)]\s+|[IVXLC]+\.\s+)/.test(line));

    if (looksLikeTitle && !line.startsWith("#")) {
      out.push(`## ${line}`);
    } else {
      out.push(line);
    }
  }

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Converte TSV (saída do sheetjs) em tabela Markdown. */
export function tsvToMarkdownTable(tsv: string, maxRows = 200): string {
  const lines = tsv
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (!lines.length) return "_Tabela vazia_";

  const rows = lines
    .slice(0, maxRows)
    .map((line) => line.split("\t").map((c) => c.replace(/\|/g, "\\|").trim()));
  const colCount = Math.max(...rows.map((r) => r.length));
  const pad = (cells: string[]) => {
    while (cells.length < colCount) cells.push("");
    return cells;
  };

  const header = pad(rows[0] ?? []);
  const body = rows.slice(1).map(pad);
  const sep = header.map(() => "---");

  const fmt = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const table = [fmt(header), fmt(sep), ...body.map(fmt)].join("\n");
  if (lines.length > maxRows) {
    return `${table}\n\n_… ${lines.length - maxRows} linhas omitidas_`;
  }
  return table;
}

export function truncateDocumentMarkdown(
  md: string,
  maxChars = MAX_DOCUMENT_CHARS,
): { text: string; meta: SanitizeMeta } {
  const originalChars = md.length;
  if (md.length <= maxChars) {
    return {
      text: md,
      meta: { truncated: false, originalChars, outputChars: md.length },
    };
  }
  const cut = md.slice(0, maxChars).trimEnd();
  const text = `${cut}\n\n_… documento truncado (${originalChars.toLocaleString()} → ${maxChars.toLocaleString()} caracteres)_`;
  return {
    text,
    meta: { truncated: true, originalChars, outputChars: text.length },
  };
}

/** Pipeline completo: sanitizar → (opcional estruturar) → truncar. */
export function finalizeDocumentMarkdown(
  raw: string,
  options?: { structure?: boolean; maxChars?: number },
): { markdown: string; meta: SanitizeMeta } {
  let md = sanitizeDocumentMarkdown(raw);
  if (options?.structure !== false && !/^#+\s/m.test(md) && !/^\|/.test(md)) {
    md = structurePlainTextAsMarkdown(md);
  }
  const { text, meta } = truncateDocumentMarkdown(md, options?.maxChars);
  return { markdown: text, meta };
}
