/** Higieniza prosa voltada ao usuário — preserva mermaid/wireframe; remove código e seed leak. */

import { stripNonDiagramFences } from "../_shared/diagram-fences.ts";

const PATH_INLINE_RE = /`(?:src|app|lib|components|pages|supabase|public)[^\s`]+`/gi;
const CSS_TOKEN_LINE_RE = /^.*(?:--color-|@theme|--surface-|--background|--foreground).*$/gm;

export function sanitizeUserFacingProse(text: string | null | undefined): string {
  const raw = text?.trim();
  if (!raw) return "";

  let t = stripNonDiagramFences(raw);
  t = t.replace(PATH_INLINE_RE, "");
  t = t.replace(CSS_TOKEN_LINE_RE, "");
  t = t.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();

  return t;
}