import type { ThreadItem } from "@/lib/chat/types";
import {
  resolveClosingProse,
  sanitizeChatProseForDisplay,
} from "@/lib/chat/stream-prose";

/** Texto copiável do turno assistant — abertura + fechamento (sem thought/mini-card). */
export function assistantTurnCopyText(
  item: Extract<ThreadItem, { kind: "assistant" }>,
): string {
  const narration = sanitizeChatProseForDisplay(item.narration);
  const rawClosing = sanitizeChatProseForDisplay(
    item.streamText?.trim() ||
      item.error?.trim() ||
      item.message?.content?.trim() ||
      "",
  );
  const closing = resolveClosingProse(narration, rawClosing);
  const parts: string[] = [];
  if (narration) parts.push(narration);
  if (closing) parts.push(closing);
  return parts.join("\n\n");
}