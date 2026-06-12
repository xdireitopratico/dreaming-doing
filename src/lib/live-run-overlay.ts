import type { AgentProgress } from "@/lib/agent-progress";

/** Mantém slot live no chat até a mensagem assistant materializar no DB. */
export function shouldRetainLiveRunSlot(progress: AgentProgress): boolean {
  if (!progress.finished) return true;
  if (progress.canceled) return false;
  if (
    progress.awaiting &&
    (progress.awaitingKind === "clarify" ||
      (progress.awaitingKind as string | null) === "qualify")
  ) {
    return false;
  }
  if (progress.pendingPlan?.steps?.length) return true;
  if (progress.awaiting) return true;
  if (progress.latencyThoughtMs != null && progress.latencyThoughtMs > 0) return true;
  if (progress.streamText?.trim() || progress.narrationText?.trim()) return true;
  if ((progress.deliveryFiles?.length ?? 0) > 0) return true;
  if ((progress.timeline?.length ?? 0) > 0) return true;
  if ((progress.tools?.length ?? 0) > 0) return true;
  return progress.lastFinishOk === true;
}