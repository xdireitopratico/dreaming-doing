import type { ChatMessage } from "../types.ts";

function systemText(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content.trim();
  return "";
}

/** NVIDIA NIM (Qwen/Nemotron): uma única mensagem system no início da conversa. */
export function normalizeMessagesForNim(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return messages;

  const systemParts: string[] = [];
  const rest: ChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      const text = systemText(msg.content);
      if (text) systemParts.push(text);
      continue;
    }
    rest.push(msg);
  }

  if (systemParts.length === 0) return messages;

  const merged = systemParts.join("\n\n");
  return [{ role: "system", content: merged }, ...rest];
}

export function isNvidiaNimBaseUrl(baseUrl: string): boolean {
  return baseUrl.includes("integrate.api.nvidia.com");
}