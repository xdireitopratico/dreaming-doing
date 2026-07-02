import type { AgentProgress } from "@/lib/agent-progress";
import { resolveTerminalPhase } from "@/lib/agent-progress";
import { resolveAgentLifecycle } from "@/lib/agent-lifecycle";

/** Mantém slot live no chat até a mensagem assistant materializar no DB. */
export function shouldRetainLiveRunSlot(progress: AgentProgress): boolean {
  const lifecycle = resolveAgentLifecycle({
    progress,
    activeRunId: null,
    running: !progress.finished,
  });
  if (lifecycle === "complete" || lifecycle === "cancel") return false;
  if (resolveTerminalPhase(progress) === "closing") return true;
  if (!progress.finished) return true;
  if (progress.canceled) return false;
  if (progress.pendingPlan?.steps?.length) return true;
  if (progress.awaiting) return true;
  if (lifecycle === "stale" || lifecycle === "failed") return true;
  if (progress.workingDurationMs != null && progress.workingDurationMs > 0) return true;
  if (progress.streamText?.trim() || progress.narrationText?.trim()) return true;
  if ((progress.deliveryFiles?.length ?? 0) > 0) return true;
  if ((progress.timeline?.length ?? 0) > 0) return true;
  if ((progress.tools?.length ?? 0) > 0) return true;
  if (progress.error?.trim()) return true;
  if (progress.lastFinishOk === false) return true;
  return progress.lastFinishOk === true;
}
