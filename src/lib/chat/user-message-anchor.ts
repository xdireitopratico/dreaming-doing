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
 * Offset de scroll que alinha a bolha do usuário ao topo do painel.
 * Usado apenas para detectar se o usuário rolou para longe da âncora —
 * o ancoramento em si usa `scrollIntoView({ block: "start" })` + scroll
 * anchoring nativo do navegador, sem spacer nem medições contínuas.
 */
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