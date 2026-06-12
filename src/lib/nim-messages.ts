/** Espelho testável de supabase/functions/agent-run/adapters/nim-messages.ts */

export type NimChatMessage = {
  role: string;
  content?: string | unknown;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
};

function systemText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  return "";
}

/**
 * NVIDIA NIM (Qwen/Nemotron) exige uma única mensagem system no início.
 * O loop envia 2+ blocos system (prompt + contexto + resumo comprimido).
 */
export function normalizeMessagesForNim<T extends NimChatMessage>(messages: T[]): T[] {
  if (messages.length === 0) return messages;

  const systemParts: string[] = [];
  const rest: T[] = [];

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
  return [{ role: "system", content: merged } as T, ...rest];
}

export function isNvidiaNimBaseUrl(baseUrl: string): boolean {
  return baseUrl.includes("integrate.api.nvidia.com");
}