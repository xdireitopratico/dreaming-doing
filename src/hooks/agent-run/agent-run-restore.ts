import type { AgentProgress } from "@/lib/agent-progress";
import { isAssistantRunMaterialized } from "@/lib/assistant-materialized";
import { progressFromAssistantMessage } from "@/lib/assistant-run-progress";
import { shouldRestoreLiveRun } from "@/lib/agent-snapshot-restore";
import type { ChatMessage } from "@/lib/chat-types";

export type LiveRunRow = {
  id: string;
  status: string | null;
  heartbeat_at: string | null;
  started_at: string | null;
  canceled_at: string | null;
};

export type RestorePlan =
  | { kind: "none" }
  | { kind: "subscribe"; runId: string }
  | { kind: "progress"; progress: AgentProgress };

export function planLiveRunRestore(
  run: LiveRunRow | null,
  lastStreamAt: string | null,
  messages: ChatMessage[],
): RestorePlan {
  if (!run?.id) return { kind: "none" };

  const alreadyMaterialized = messages.some(
    (m) => m.runId === run.id && isAssistantRunMaterialized(m),
  );
  if (alreadyMaterialized) return { kind: "none" };

  const fresh = shouldRestoreLiveRun({
    status: run.status,
    canceledAt: run.canceled_at,
    heartbeatAt: run.heartbeat_at,
    startedAt: run.started_at,
    lastStreamAt,
  });
  if (!fresh) return { kind: "none" };
  return { kind: "subscribe", runId: run.id };
}

/** Reidrata gate awaiting (clarify/plan) a partir de mensagens do DB — sem sessionStorage. */
export function planAwaitingProgressRestore(messages: ChatMessage[]): AgentProgress | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    if (isAssistantRunMaterialized(msg)) continue;

    const progress = progressFromAssistantMessage(msg);
    if (!progress) continue;

    const awaitingClarify =
      progress.awaiting &&
      (progress.awaitingKind === "clarify" ||
        (progress.awaitingKind as string | null) === "qualify");
    const awaitingPlan =
      progress.awaitingKind === "plan_approval" && !!progress.pendingPlan;

    if (awaitingClarify || awaitingPlan) {
      return { ...progress, finished: true };
    }
  }
  return null;
}