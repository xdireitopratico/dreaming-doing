import type { ChatMessage } from "@/lib/chat-types";

function hasVisibleText(message: ChatMessage): boolean {
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

/** Só libera acknowledge/frozen quando a mensagem assistant é terminal no DB (finishedAt, não partial). */
export function isAssistantRunMaterialized(message: ChatMessage): boolean {
  const meta = message.meta;
  if (!meta || typeof meta !== "object") return false;

  const m = meta as Record<string, unknown>;
  if (m.partial === true) return false;
  if (typeof m.finishedAt !== "string" || !m.finishedAt.trim()) return false;

  return hasVisibleText(message);
}
