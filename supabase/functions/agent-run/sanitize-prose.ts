/** Higieniza prosa voltada ao usuário — sem paths, fences nem tokens de seed. */

const PATH_INLINE_RE = /`(?:src|app|lib|components|pages|supabase|public)[^\s`]+`/gi;
const FENCE_RE = /```[\s\S]*?```/g;
const CSS_TOKEN_LINE_RE = /^.*(?:--color-|@theme|--surface-|--background|--foreground).*$/gm;

export function sanitizeUserFacingProse(text: string | null | undefined): string {
  const raw = text?.trim();
  if (!raw) return "";

  let t = raw.replace(FENCE_RE, "");
  t = t.replace(PATH_INLINE_RE, "");
  t = t.replace(CSS_TOKEN_LINE_RE, "");
  t = t.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();

  return t;
}