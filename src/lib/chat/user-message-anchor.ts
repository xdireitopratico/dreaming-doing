export type ChatScrollMode = "bottom" | "user-anchor";

/** Só ancora quando o usuário acabou de enviar — nunca no F5 / hydrate do histórico. */
export function shouldAnchorNewUserMessage(
  prevId: string | null,
  nextId: string | null,
  initialScrollDone: boolean,
): nextId is string {
  if (!initialScrollDone) return false;
  if (!nextId) return false;
  return prevId !== nextId;
}

/**
 * Espaço extra abaixo do turno ativo — sem isso o scroll não consegue
 * subir a bolha do usuário até o topo do painel (limite físico do scrollHeight).
 */
export function computeUserAnchorSpacerHeight(
  containerClientHeight: number,
  bubbleHeight: number,
  paddingTop = 0,
  paddingBottom = 0,
  gap = 8,
): number {
  if (containerClientHeight <= 0) return 0;
  const reserved = bubbleHeight + paddingTop + paddingBottom + gap;
  return Math.max(0, Math.ceil(containerClientHeight - reserved));
}

export function scrollOffsetToAlignUserMessage(
  container: HTMLElement,
  bubble: HTMLElement,
): number {
  const style = getComputedStyle(container);
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const raw =
    bubble.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop -
    paddingTop;
  const max = Math.max(0, container.scrollHeight - container.clientHeight);
  return Math.max(0, Math.min(max, raw));
}

/** Mantém modo user-anchor enquanto o turno está ativo (pending, running ou run não terminal). */
export function shouldHoldUserMessageAnchor(input: {
  isPendingRun: boolean;
  running: boolean;
  activeRunId: string | null;
  finished: boolean;
}): boolean {
  if (input.isPendingRun) return true;
  if (input.running) return true;
  if (input.activeRunId && !input.finished) return true;
  return false;
}