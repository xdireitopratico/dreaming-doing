export type ChatScrollMode = "bottom" | "user-anchor";

export function scrollOffsetToAlignUserMessage(
  container: HTMLElement,
  bubble: HTMLElement,
): number {
  const paddingTop = parseFloat(getComputedStyle(container).paddingTop) || 0;
  return (
    bubble.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop -
    paddingTop
  );
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