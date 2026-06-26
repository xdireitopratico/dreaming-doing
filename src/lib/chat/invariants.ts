import type { ThreadItem } from "@/lib/chat/types";

/** Ordem DOM fixa — Thought → LLM → Mini Card → LLM. */
export const ASSISTANT_TURN_DOM_ORDER = [
  "thinking",
  "narration",
  "miniCard",
  "prose",
] as const;

/**
 * Corrige violações silenciosamente em runtime — nunca quebra o chat do usuário.
 * Testes usam assertAssistantTurnInvariant para falhar cedo em regressões.
 *
 * Regras reforçadas (Fase 2.2 — chat turn UX):
 *  - Fechamento (streamText) só aparece após o job terminar (não durante run ativa).
 *  - Run ativa com mini-card/narração recebe linha de pensamento estável
 *    mesmo se o LLM ainda não emitiu thinking (preserva ordem DOM Lovable).
 */
export function enforceAssistantTurnInvariant(
  item: Extract<ThreadItem, { kind: "assistant" }>,
): Extract<ThreadItem, { kind: "assistant" }> {
  let streamText = item.streamText;
  let thinking = item.thinking;

  // Fechamento só após o job — durante run: narração + mini-card visíveis.
  if (item.isActive && item.miniCard && streamText) {
    streamText = null;
  }

  // Run ativa sem thinking: força linha de pensamento estável para preservar
  // a posição DOM Lovable (Thinking → Narração → Mini-card → Fechamento).
  if (item.isActive && !thinking && (item.miniCard || item.narration)) {
    thinking = { status: "active" };
  }

  if (streamText === item.streamText && thinking === item.thinking) {
    return item;
  }

  return { ...item, streamText, thinking };
}

/** Guarda de integridade — falha em testes se o turno violar contrato Lovable. */
export function assertAssistantTurnInvariant(
  item: Extract<ThreadItem, { kind: "assistant" }>,
): void {
  if (item.isActive && item.miniCard && item.streamText) {
    throw new Error(
      `Lovable invariant violated: closing prose only after job (runId=${item.runId})`,
    );
  }
  if (item.isActive && !item.thinking && (item.miniCard || item.narration)) {
    throw new Error(
      `Lovable invariant violated: active turn without thinking line (runId=${item.runId})`,
    );
  }
}