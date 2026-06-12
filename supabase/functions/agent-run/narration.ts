// narration.ts — Utilitário LLM compartilhado (ex.: plan-mode).
// Narração de loop e fechamento: loop-status.ts (determinístico + prosa do agente principal).

import type { LLMProvider } from "./types.ts";

type LlmLineOpts = {
  max_tokens?: number;
  temperature?: number;
  minLength?: number;
  retries?: number;
};

/** Chamada LLM com retry — retorna null se o modelo falhar. */
export async function llmChatLine(
  model: LLMProvider,
  system: string,
  user: string,
  opts?: LlmLineOpts,
): Promise<string | null> {
  const retries = opts?.retries ?? 2;
  const minLength = opts?.minLength ?? 8;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await model.chat({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: opts?.max_tokens ?? 280,
        temperature: opts?.temperature ?? 0.45,
      });
      const text = (resp.content ?? "").trim();
      if (text.length >= minLength) return text;
    } catch {
      /* retry */
    }
  }
  return null;
}