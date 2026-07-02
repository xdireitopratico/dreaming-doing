// runtime/turn-opening.ts — Abertura do turno via re-call LLM (spec chat-turn-ux, sem fallback hardcoded)
import { sanitizeUserFacingProse } from "../sanitize-prose.ts";
import type { ChatMessage, LLMProvider } from "../types.ts";

const OPENING_NUDGE =
  "Antes de usar ferramentas, escreva uma frase curta de abertura para o usuário: " +
  "o que você entendeu do pedido e o que vai fazer agora. " +
  "Sem listar ferramentas. Uma ou duas frases, tom direto.";

export async function attemptOpeningProse(input: {
  messages: ChatMessage[];
  model: LLMProvider;
  userRequest: string;
}): Promise<string | null> {
  const history = [
    ...input.messages,
    { role: "user" as const, content: OPENING_NUDGE },
  ];
  try {
    const response = await input.model.chat({
      messages: history,
      tool_choice: "none",
      tools: [],
      max_tokens: 256,
      temperature: 0.5,
    });
    const text = sanitizeUserFacingProse((response.content ?? "").trim());
    return text || null;
  } catch {
    return null;
  }
}