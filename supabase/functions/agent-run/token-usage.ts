/** C17 — normaliza usage de provedores e estima tokens do histórico. */

import type { ChatMessage } from "./types.ts";

export type NormalizedUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
};

export const INPUT_TOKEN_WARN = 36_000;
export const INPUT_TOKEN_FORCE = 48_000;

export function normalizeChatUsage(raw: unknown): NormalizedUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, number>;
  const input = u.input_tokens ?? u.prompt_tokens ?? u.promptTokenCount ?? 0;
  const output = u.output_tokens ?? u.completion_tokens ?? u.candidatesTokenCount ?? 0;
  const total = u.total_tokens ?? input + output;
  if (input <= 0 && output <= 0 && total <= 0) return undefined;
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    prompt_tokens: input,
    completion_tokens: output,
  };
}

/** Estimativa conservadora quando o provedor não retorna usage. */
export function estimateMessageTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      chars += m.content.length;
    } else if (Array.isArray(m.content)) {
      chars += JSON.stringify(m.content).length;
    }
    if (m.tool_calls?.length) chars += JSON.stringify(m.tool_calls).length;
  }
  return Math.ceil(chars / 3.5);
}
