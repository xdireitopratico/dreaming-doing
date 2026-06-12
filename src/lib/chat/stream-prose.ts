/** Evita repetir o mesmo parágrafo no fechamento (streaming/narração duplicada). */
export function resolveClosingProse(
  narration: string | null | undefined,
  closing: string | null | undefined,
): string | null {
  const c = closing?.trim();
  if (!c) return null;
  const n = narration?.trim();
  if (!n) return c;
  if (c === n) return null;
  if (c.startsWith(n) && c.slice(n.length).trim().length < 24) return null;
  if (n.startsWith(c)) return null;

  const repeat = (c.match(new RegExp(escapeRegExp(n.slice(0, Math.min(40, n.length))), "g")) ?? [])
    .length;
  if (repeat >= 2) return n;

  return c;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}