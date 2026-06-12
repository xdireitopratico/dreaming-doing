import type { ThreadItem } from "@/lib/chat/types";

/** Ordem DOM fixa no turno assistant — espelha plan.md §2. */
export const ASSISTANT_TURN_DOM_ORDER = [
  "thought",
  "narration",
  "statusChips",
  "miniCard",
  "done",
  "prose",
  "qualify",
] as const;

/**
 * Chips e mini-card são mutuamente exclusivos em todos os prints Lovable.
 * Estado B (img 4): chips sem card. Estado C/D (imgs 5/8/9/14): card sem chips.
 * Terminal (img 15): chips sem card.
 */
export function resolveTurnStatusChips(
  rawChips: string[],
  showMiniCard: boolean,
): string[] {
  if (showMiniCard) return [];
  return rawChips;
}

/** Guarda de integridade — falha em testes se o turno violar contrato Lovable. */
export function assertAssistantTurnInvariant(
  item: Extract<ThreadItem, { kind: "assistant" }>,
): void {
  const hasCard = !!item.miniCard;
  const chips = item.statusChips ?? [];

  if (hasCard && chips.length > 0) {
    throw new Error(
      `Lovable invariant violated: mini-card and status chips cannot coexist (runId=${item.runId})`,
    );
  }

  if (chips.length > 2 && item.isActive) {
    throw new Error(
      `Lovable invariant violated: live turn allows max 2 chips (runId=${item.runId}, got ${chips.length})`,
    );
  }

  if (chips.length > 4) {
    throw new Error(
      `Lovable invariant violated: max 4 terminal chips (runId=${item.runId}, got ${chips.length})`,
    );
  }

  if (item.planTeaser && item.streamText) {
    throw new Error(
      `Lovable invariant violated: plan teaser hides stream prose (runId=${item.runId})`,
    );
  }
}