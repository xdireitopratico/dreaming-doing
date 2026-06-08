import type { ChatMessage } from "@/components/editor/ChatInput";

/** Só libera acknowledge/frozen quando a mensagem assistant tem texto final no DB. */
export function isAssistantRunMaterialized(message: ChatMessage): boolean {
  const meta = message.meta;
  if (meta && typeof meta === "object" && (meta as Record<string, unknown>).partial === true) {
    return false;
  }

  if (message.content?.trim()) return true;

  const parts = message.parts;
  if (Array.isArray(parts)) {
    return parts.some(
      (p) =>
        p &&
        typeof p === "object" &&
        (p as { type?: string; text?: string }).type === "text" &&
        typeof (p as { text?: string }).text === "string" &&
        (p as { text: string }).text.trim().length > 0,
    );
  }

  return false;
}