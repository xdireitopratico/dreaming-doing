import type { ChatMessage } from "@/lib/chat-types";
import type { PendingPlan, PlanStep } from "@/lib/agent-progress";

/** Run pertence ao histórico desta conversa (assistant ou buildRunId em user). */
export function runBelongsToChatMessages(
  runId: string | null | undefined,
  messages: ChatMessage[],
): boolean {
  if (!runId) return false;
  for (const msg of messages) {
    if (msg.runId === runId) return true;
    const meta = msg.meta as Record<string, unknown> | undefined;
    if (typeof meta?.runId === "string" && meta.runId === runId) return true;
    if (typeof meta?.buildRunId === "string" && meta.buildRunId === runId) return true;
  }
  return false;
}

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
function livePlanBelongsToSession(
  live: PendingPlan,
  messages: ChatMessage[],
  activeRunId?: string | null,
): boolean {
  if (runBelongsToChatMessages(live.runId, messages)) return true;
  return !!activeRunId && activeRunId === live.runId;
}

export function resolvePendingPlan(
  live: PendingPlan | null | undefined,
  messages: ChatMessage[],
  activeRunId?: string | null,
): PendingPlan | null {
  if (live && livePlanBelongsToSession(live, messages, activeRunId)) return live;
  return findPendingPlanFromMessages(messages);
}

/**
 * true só se tem plano PENDENTE que o usuário PRECISA aprovar/rejeitar AGORA
 * para o chat continuar fluido.
 * Planos antigos ou já processados não bloqueiam o input.
 */
export function needsPlanApprovalNow(
  live: PendingPlan | null | undefined,
  messages: ChatMessage[],
  activeRunId?: string | null,
): boolean {
  const plan = resolvePendingPlan(live, messages, activeRunId);
  if (!plan) return false;
  if (live && livePlanBelongsToSession(live, messages, activeRunId)) return true;
  // Do histórico: só se o último status for pending (não aprovado ainda)
  const stored = findStoredPlanForPlan(plan, messages);
  return stored?.status === "pending";
}

function findStoredPlanForPlan(plan: PendingPlan, messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const s = storedPlanFromMessage(m);
    if (s && s.plan.planId === plan.planId) return s;
  }
  return null;
}

export type ResolveJobPlanOptions = {
  livePlan?: PendingPlan | null;
  progressPlan?: PendingPlan | null;
  assistantMessage?: ChatMessage;
};

/** Plano/requisitos do job para um runId — usado no mini-card (não confundir com timeline SSE). */
export function resolveJobPlanForRun(
  runId: string,
  messages: ChatMessage[],
  opts: ResolveJobPlanOptions = {},
): PendingPlan | null {
  const { livePlan, progressPlan, assistantMessage } = opts;

  if (livePlan?.runId === runId && livePlan.steps.length > 0) return livePlan;
  if (progressPlan?.runId === runId && progressPlan.steps.length > 0) return progressPlan;

  if (assistantMessage) {
    const stored = storedPlanFromMessage(assistantMessage);
    if (stored?.plan.runId === runId && stored.plan.steps.length > 0) return stored.plan;
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "user") continue;
    const meta = msg.meta as Record<string, unknown> | undefined;
    if (meta?.buildRunId !== runId) continue;
    const planSourceRunId = typeof meta.planSourceRunId === "string" ? meta.planSourceRunId : null;
    const planId = typeof meta.planId === "string" ? meta.planId : null;
    if (!planSourceRunId) continue;

    for (let j = messages.length - 1; j >= 0; j--) {
      const am = messages[j];
      if (am?.role !== "assistant") continue;
      const ameta = am.meta as Record<string, unknown> | undefined;
      if (ameta?.runId !== planSourceRunId) continue;
      if (planId && ameta.planId !== planId) continue;
      const stored = storedPlanFromMessage(am);
      if (stored?.plan.steps.length) return stored.plan;
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    const stored = storedPlanFromMessage(msg);
    if (stored?.plan.runId === runId && stored.plan.steps.length > 0) return stored.plan;
  }

  return null;
}

export type StoredPlanStatus = "pending" | "rejected" | "approved";

export type InspectorPlanState = {
  plan: PendingPlan;
  status: StoredPlanStatus;
  awaitingApproval: boolean;
};

/** Último plano persistido no meta para um runId (histórico DB-first). */
export function findStoredPlanForRunId(
  runId: string,
  messages: ChatMessage[],
): StoredPlanMeta | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    const stored = storedPlanFromMessage(msg);
    if (stored?.plan.runId === runId) return stored;
  }
  return null;
}

/** Plano do inspector — DB-first; live só enquanto aguarda aprovação. */
export function resolveInspectorPlanForRun(
  runId: string,
  messages: ChatMessage[],
  opts: ResolveJobPlanOptions = {},
): InspectorPlanState | null {
  const plan = resolveJobPlanForRun(runId, messages, opts);
  if (!plan) return null;

  const stored = findStoredPlanForRunId(runId, messages);
  const status: StoredPlanStatus = stored?.status ?? "pending";
  const liveMatches = opts.livePlan?.runId === runId;

  const awaitingApproval =
    status === "pending" &&
    (liveMatches || needsPlanApprovalNow(liveMatches ? opts.livePlan : null, messages));

  return { plan, status, awaitingApproval };
}

export function planHeadlineFromPlan(plan: PendingPlan): string {
  return plan.mission?.trim() || plan.summary?.trim() || "Plano proposto";
}

/** Corpo do plano no inspector — parágrafo único legível (referência Lovable img 14). */
export function planParagraphFromPlan(plan: PendingPlan): string {
  const markdown = plan.markdown?.trim();
  if (markdown && !/^##\s/m.test(markdown)) return markdown;

  const mission = plan.mission?.trim();
  const objective = plan.objective?.trim();
  if (mission) return mission;
  if (objective) return objective;
  return plan.summary?.trim() || "Plano proposto";
}

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
