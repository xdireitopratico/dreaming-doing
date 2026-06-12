import type { ThreadItem } from "@/lib/chat/types";

/** Texto copiável do turno assistant — abertura + fechamento (sem thought/mini-card). */
export function assistantTurnCopyText(
  item: Extract<ThreadItem, { kind: "assistant" }>,
): string {
  const parts: string[] = [];
  const narration = item.narration?.trim();
  const closing =
    item.streamText?.trim() ||
    item.error?.trim() ||
    item.message?.content?.trim() ||
    "";
  if (narration) parts.push(narration);
  if (closing && closing !== narration) parts.push(closing);
  return parts.join("\n\n");
}