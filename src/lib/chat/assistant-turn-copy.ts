import type { ThreadItem } from "@/lib/chat/types";
import { resolveClosingProse } from "@/lib/chat/stream-prose";

/** Texto copiável do turno assistant — raw visível (display continua sanitizado). */
export function assistantTurnCopyText(
  item: Extract<ThreadItem, { kind: "assistant" }>,
): string {
  const narration = item.narration?.trim() || "";
  const rawClosing =
    item.streamText?.trim() ||
    item.error?.trim() ||
    item.message?.content?.trim() ||
    "";
  const closing = resolveClosingProse(narration, rawClosing);
  const parts: string[] = [];
  if (narration) parts.push(narration);
  if (closing) parts.push(closing);
  return parts.join("\n\n");
}