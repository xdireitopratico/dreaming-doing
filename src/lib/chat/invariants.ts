import type { ThreadItem } from "@/lib/chat/types";

/** Ordem DOM fixa — Thought → LLM → Mini Card → LLM. */
export const ASSISTANT_TURN_DOM_ORDER = [
  "thought",
  "narration",
  "miniCard",
  "prose",
] as const;

/** Chips e mini-card são mutuamente exclusivos (Lovable). */
export function resolveTurnStatusChips(
  rawChips: string[],
  showMiniCard: boolean,
): string[] {
  if (showMiniCard) return [];
  return rawChips;
}

/**
 * Corrige violações silenciosamente em runtime — nunca quebra o chat do usuário.
 * Testes usam assertAssistantTurnInvariant para falhar cedo em regressões.
 */
export function enforceAssistantTurnInvariant(
  item: Extract<ThreadItem, { kind: "assistant" }>,
): Extract<ThreadItem, { kind: "assistant" }> {
  let streamText = item.streamText;

  // Fechamento só após o job — durante run: narração + mini-card.
  if (item.isActive && item.miniCard && streamText) {
    streamText = null;
  }

  if (streamText === item.streamText) {
    return item;
  }

  return { ...item, streamText, statusChips: [] };
}

/** Guarda de integridade — falha em testes se o turno violar contrato Lovable. */
export function assertAssistantTurnInvariant(
  item: Extract<ThreadItem, { kind: "assistant" }>,
): void {
  if ((item.statusChips?.length ?? 0) > 0) {
    throw new Error(
      `Lovable invariant violated: status chips removed from chat (runId=${item.runId})`,
    );
  }

  if (item.isActive && item.miniCard && item.streamText) {
    throw new Error(
      `Lovable invariant violated: closing prose only after job (runId=${item.runId})`,
    );
  }
}