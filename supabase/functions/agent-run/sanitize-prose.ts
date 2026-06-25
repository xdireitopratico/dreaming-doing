/** Higieniza prosa voltada ao usuário — preserva mermaid/wireframe; remove código e seed leak. */

import { stripNonDiagramFences } from "../_shared/diagram-fences.ts";

const PATH_INLINE_RE = /`(?:src|app|lib|components|pages|supabase|public)[^\s`]+`/gi;
const CSS_TOKEN_LINE_RE = /^.*(?:--color-|@theme|--surface-|--background|--foreground).*$/gm;
const LEAK_META_LINE_RE =
  /^(?:\*+\s*)?(?:User says:|Context:|Goal:|Role:|Length:|No execution|No heavy markdown|Bold for key terms|Emojis:|The user is|I need to|Hero section\.|Dual path\b|Marketplace preview\.|Dark theme vibe\.|Use `wireframe` block|Draft \d|Wait, the prompt says|Wireframe content:?|Refining the prose:?|Adding the wireframe block\.?)/i;
const INLINE_LEAK_PREFIX_RE =
  /^\s*\*?\s*\*?(?:Wireframe content:?|Refining the prose:?|Adding the wireframe block\.?)\*?\s*/i;

function sanitizePlainUserFacingProse(text: string): string {
  let t = stripNonDiagramFences(text.trim());
  t = t.replace(PATH_INLINE_RE, "");
  t = t.replace(CSS_TOKEN_LINE_RE, "");
  t = t
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return t;
}

function normalizeReasoningLine(line: string): string {
  return line.replace(/^\s*\*+\s*/, "").trim();
}

export function splitUserFacingChatReply(text: string | null | undefined): {
  userText: string;
  reasoningText: string | null;
} {
  const raw = text?.trim();
  if (!raw) return { userText: "", reasoningText: null };

  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const reasoningLines: string[] = [];
  const publicLines: string[] = [];
  let sawLeakScaffold = false;
  let inPublicReply = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inPublicReply) {
      if (trimmed && LEAK_META_LINE_RE.test(trimmed)) {
        sawLeakScaffold = true;
        reasoningLines.push(normalizeReasoningLine(trimmed));
        continue;
      }

      if (sawLeakScaffold) {
        if (!trimmed) continue;

        const inlinePublic = line.replace(INLINE_LEAK_PREFIX_RE, "").trimStart();
        if (inlinePublic) {
          inPublicReply = true;
          publicLines.push(inlinePublic);
          continue;
        }

        inPublicReply = true;
      }
    }

    publicLines.push(line);
  }

  if (!sawLeakScaffold) {
    return {
      userText: sanitizePlainUserFacingProse(raw),
      reasoningText: null,
    };
  }

  const sanitizedPublic = sanitizePlainUserFacingProse(publicLines.join("\n"));
  return {
    userText: sanitizedPublic || sanitizePlainUserFacingProse(raw),
    reasoningText: reasoningLines.length > 0 ? reasoningLines.join("\n") : null,
  };
}

export function sanitizeUserFacingProse(text: string | null | undefined): string {
  return splitUserFacingChatReply(text).userText;
}
