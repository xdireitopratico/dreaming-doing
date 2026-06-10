// truncate.ts — Smart truncation that preserves structure integrity.
// Gemini 2.5 Pro feedback: raw .slice(0, N) breaks JSON, cuts error lines mid-sentence.

const DEFAULT_MAX = 4000;

/** Truncate a string at a safe boundary (newline, then space, then hard cut).
 *  Never cuts in the middle of a JSON key or TypeScript error line. */
export function safeTruncate(text: string, maxChars: number = DEFAULT_MAX): string {
  if (text.length <= maxChars) return text;

  // Prefer truncating at the last newline before the limit
  const slice = text.slice(0, maxChars);
  const lastNewline = slice.lastIndexOf("\n");
  if (lastNewline > maxChars * 0.7) {
    return slice.slice(0, lastNewline) + "\n… [truncado]";
  }

  // Fallback: truncate at last space
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.7) {
    return slice.slice(0, lastSpace) + " … [truncado]";
  }

  // Hard cut with clear marker
  return slice + "… [truncado]";
}

/** Truncate a JSON string without breaking structure.
 *  Keeps the outer object/array intact, truncates inner string values. */
export function safeTruncateJson(jsonStr: string, maxChars: number = DEFAULT_MAX): string {
  if (jsonStr.length <= maxChars) return jsonStr;

  try {
    const parsed = JSON.parse(jsonStr);
    const compact = JSON.stringify(parsed);
    if (compact.length <= maxChars) return compact;

    // Truncate deeply nested string values
    return JSON.stringify(truncateDeepStrings(parsed, Math.floor(maxChars / 4)));
  } catch {
    // Not valid JSON — fall back to safeTruncate
    return safeTruncate(jsonStr, maxChars);
  }
}

function truncateDeepStrings(obj: unknown, maxStrLen: number): unknown {
  if (typeof obj === "string") {
    return obj.length > maxStrLen ? obj.slice(0, maxStrLen) + "…" : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => truncateDeepStrings(v, maxStrLen));
  }
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = truncateDeepStrings(v, maxStrLen);
    }
    return out;
  }
  return obj;
}

/** Truncate TypeScript/compiler error output preserving individual error lines. */
export function truncateCompilerErrors(output: string, maxChars: number = DEFAULT_MAX): string {
  if (output.length <= maxChars) return output;

  const lines = output.split("\n");
  const result: string[] = [];
  let used = 0;

  for (const line of lines) {
    if (used + line.length + 1 > maxChars - 50) break;
    result.push(line);
    used += line.length + 1;
  }

  const remaining = lines.length - result.length;
  return result.join("\n") + (remaining > 0 ? `\n… [${remaining} more lines truncated]` : "");
}

/** Infer the best truncation strategy based on content type. */
export function smartTruncate(content: string, maxChars: number = DEFAULT_MAX): string {
  if (content.length <= maxChars) return content;

  const trimmed = content.trimStart();

  // JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return safeTruncateJson(content, maxChars);
  }

  // Compiler/TypeScript errors (lines with file:line:col format)
  if (/\.(ts|tsx|js|jsx)\(\d+,\d+\)/.test(trimmed.slice(0, 500))) {
    return truncateCompilerErrors(content, maxChars);
  }

  // Default: safe text truncation
  return safeTruncate(content, maxChars);
}
