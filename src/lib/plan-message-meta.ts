import type { ChatMessage } from "@/components/editor/ChatInput";
import type { PendingPlan, PlanStep } from "@/lib/agent-progress";

/** Último plano pendente persistido no histórico (sobrevive a F5). */
export function findPendingPlanFromMessages(messages: ChatMessage[]): PendingPlan | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    const stored = storedPlanFromMessage(msg);
    if (stored?.status === "pending") return stored.plan;
  }
  return null;
}

/** Plano ativo: memória do agente ou último pendente no chat. */
export function resolvePendingPlan(
  live: PendingPlan | null | undefined,
  messages: ChatMessage[],
): PendingPlan | null {
  return live ?? findPendingPlanFromMessages(messages);
}

export type StoredPlanStatus = "pending" | "rejected" | "approved";

export type StoredPlanMeta = {
  status: StoredPlanStatus;
  plan: PendingPlan;
};

function asPlanSteps(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s && typeof s === "object") as PlanStep[];
}

/** Plano persistido no meta da mensagem assistant (histórico Lovable). */
export function storedPlanFromMessage(message?: ChatMessage): StoredPlanMeta | null {
  if (!message?.meta) return null;
  const meta = message.meta as Record<string, unknown>;
  const planId = typeof meta.planId === "string" ? meta.planId : null;
  const runId = typeof meta.runId === "string" ? meta.runId : null;
  const steps = asPlanSteps(meta.planSteps);
  if (!planId || !runId || steps.length === 0) return null;

  const statusRaw = meta.planStatus;
  const status: StoredPlanStatus =
    statusRaw === "rejected" || statusRaw === "approved" || statusRaw === "pending"
      ? statusRaw
      : "pending";

  return {
    status,
    plan: {
      planId,
      summary: typeof meta.planSummary === "string" ? meta.planSummary : "Plano proposto",
      rationale:
        typeof meta.planRationale === "string" && meta.planRationale.trim()
          ? meta.planRationale.trim()
          : undefined,
      markdown:
        typeof meta.planMarkdown === "string" && meta.planMarkdown.trim()
          ? meta.planMarkdown.trim()
          : undefined,
      mission: typeof meta.planMission === "string" ? meta.planMission : undefined,
      objective: typeof meta.planObjective === "string" ? meta.planObjective : undefined,
      steps,
      ttlMs: Number.MAX_SAFE_INTEGER,
      proposedAt: Date.now(),
      runId,
      projectId: typeof meta.projectId === "string" ? meta.projectId : "",
    },
  };
}