const EMOJI_RE = /(\p{Extended_Pictographic}\uFE0F?)/gu;

/** Colapsa repetições do mesmo emoji (ex.: 🙂 🙂 🙂 → 🙂). */
export function normalizeRepeatedEmojis(text: string): string {
  if (!text) return text;
  const collapsed = text.replace(/(\p{Extended_Pictographic}\uFE0F?)(\s*\1)+/gu, "$1");
  const seen = new Set<string>();
  return collapsed
    .replace(EMOJI_RE, (match) => {
      if (seen.has(match)) return "";
      seen.add(match);
      return match;
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeChatProse(text: string | null | undefined): string | null {
  const t = text?.trim();
  if (!t) return null;
  return normalizeRepeatedEmojis(t);
}

import { stripNonDiagramFences } from "@/lib/chat/diagram-fences";

const PATH_INLINE_RE = /`(?:src|app|lib|components|pages|supabase|public)[^\s`]+`/gi;
const CSS_TOKEN_LINE_RE = /^.*(?:--color-|@theme|--surface-|--background|--foreground).*$/gm;

/** Remove fences de código (exceto mermaid/wireframe), paths e tokens de seed. */
export function sanitizeChatProseForDisplay(text: string | null | undefined): string | null {
  const t = text?.trim();
  if (!t) return null;
  let out = stripNonDiagramFences(t);
  out = out.replace(PATH_INLINE_RE, "");
  out = out.replace(CSS_TOKEN_LINE_RE, "");
  out = out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  if (!out) return null;
  return normalizeRepeatedEmojis(out);
}

/** Evita repetir o mesmo parágrafo no fechamento (streaming/narração duplicada). */
export function resolveClosingProse(
  narration: string | null | undefined,
  closing: string | null | undefined,
): string | null {
  const c = normalizeChatProse(closing);
  if (!c) return null;
  const n = normalizeChatProse(narration);
  if (!n) return c;
  if (c === n) return null;
  if (c.startsWith(n) && c.slice(n.length).trim().length < 24) return null;
  if (n.startsWith(c)) return null;

  return c;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}