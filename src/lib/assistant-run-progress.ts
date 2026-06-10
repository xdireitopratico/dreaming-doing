import type { ChatMessage } from "@/lib/chat-types";
import {
  initialAgentProgress,
  type AgentProgress,
  type AwaitingKind,
  type PendingPlan,
  type PlanStep,
  type SSEEvent,
} from "@/lib/agent-progress";
import { timelineFromExecutionLog } from "@/lib/agent-job-stream";
import { isAssistantRunMaterialized } from "@/lib/assistant-materialized";
import { storedPlanFromMessage } from "@/lib/plan-message-meta";

export function runIdFromAssistantMessage(msg: ChatMessage): string | undefined {
  return (
    msg.runId ??
    (typeof msg.meta?.runId === "string" ? msg.meta.runId : undefined) ??
    (typeof msg.meta?.buildRunId === "string" ? msg.meta.buildRunId : undefined)
  );
}

/** Mensagem assistant ligada a um job do agente (mini-card Lovable). */
export function isAgentJobMessage(msg?: ChatMessage): boolean {
  if (!msg) return false;
  if (runIdFromAssistantMessage(msg)) return true;
  const meta = msg.meta;
  if (!meta || typeof meta !== "object") return false;
  const m = meta as Record<string, unknown>;
  if (typeof m.finishedAt === "string") return true;
  if (Array.isArray(m.deliveryFiles) && m.deliveryFiles.length > 0) return true;
  if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) return true;
  return false;
}

/** Terminal no DB com cardSnapshot completo — fonte de verdade pós-F5. */
export function hasMaterializedCardSnapshot(msg?: ChatMessage): boolean {
  if (!msg || !isAssistantRunMaterialized(msg)) return false;
  const snap = (msg.meta as Record<string, unknown> | undefined)?.cardSnapshot;
  return snap !== null && typeof snap === "object";
}

function timelineFromMeta(meta: Record<string, unknown>): SSEEvent[] {
  const streamTail = meta.streamTail;
  if (Array.isArray(streamTail) && streamTail.length > 0) {
    return streamTail as SSEEvent[];
  }
  const executionLog = meta.executionLog;
  if (Array.isArray(executionLog) && executionLog.length > 0) {
    return timelineFromExecutionLog(executionLog as string[]);
  }
  return [];
}

function asPlanSteps(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s && typeof s === "object") as PlanStep[];
}

function pendingPlanFromSnapshot(
  raw: unknown,
  fallback?: { runId?: string; projectId?: string },
): PendingPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const nested = raw as Record<string, unknown>;
  const planId = typeof nested.planId === "string" ? nested.planId : null;
  const steps = asPlanSteps(nested.steps);
  const runId =
    typeof nested.runId === "string"
      ? nested.runId
      : fallback?.runId ?? null;
  const projectId =
    typeof nested.projectId === "string"
      ? nested.projectId
      : fallback?.projectId ?? null;
  if (!planId || steps.length === 0 || !runId) return null;

  return {
    planId,
    summary:
      typeof nested.summary === "string" ? nested.summary : "Plano proposto",
    rationale:
      typeof nested.rationale === "string" && nested.rationale.trim()
        ? nested.rationale.trim()
        : undefined,
    markdown:
      typeof nested.markdown === "string" && nested.markdown.trim()
        ? nested.markdown.trim()
        : undefined,
    mission: typeof nested.mission === "string" ? nested.mission : undefined,
    objective: typeof nested.objective === "string" ? nested.objective : undefined,
    steps,
    ttlMs: Number.MAX_SAFE_INTEGER,
    proposedAt:
      typeof nested.proposedAt === "number" ? nested.proposedAt : Date.now(),
    runId,
    projectId: projectId ?? "",
  };
}

function progressFromCardSnapshot(
  snap: Record<string, unknown>,
  msg: ChatMessage,
): AgentProgress {
  const runId = runIdFromAssistantMessage(msg);
  const projectId =
    typeof msg.meta?.projectId === "string" ? msg.meta.projectId : undefined;

  const timeline = Array.isArray(snap.timeline)
    ? (snap.timeline as SSEEvent[])
    : [];
  const tools = Array.isArray(snap.tools)
    ? (snap.tools as AgentProgress["tools"])
    : [];
  const diffs = Array.isArray(snap.diffs)
    ? (snap.diffs as AgentProgress["diffs"])
    : [];
  const deliveryFiles = Array.isArray(snap.deliveryFiles)
    ? (snap.deliveryFiles as string[])
    : [];
  const buildLogLines = Array.isArray(snap.buildLogLines)
    ? (snap.buildLogLines as AgentProgress["buildLogLines"])
    : [];

  const pendingPlan =
    pendingPlanFromSnapshot(snap.pendingPlan, {
      runId,
      projectId,
    }) ?? null;

  const awaitingKind =
    snap.awaitingKind === "qualify" || snap.awaitingKind === "plan_approval"
      ? (snap.awaitingKind as AwaitingKind)
      : pendingPlan
        ? "plan_approval"
        : null;

  const streamText =
    typeof snap.streamText === "string" && snap.streamText.trim()
      ? snap.streamText
      : msg.content?.trim() || null;

  return {
    ...initialAgentProgress,
    phase: typeof snap.phase === "string" ? snap.phase : null,
    message: typeof snap.message === "string" ? snap.message : null,
    currentStep: typeof snap.currentStep === "number" ? snap.currentStep : null,
    totalSteps: typeof snap.totalSteps === "number" ? snap.totalSteps : null,
    tools,
    timeline,
    summary: typeof snap.summary === "string" ? snap.summary : null,
    error: typeof snap.error === "string" ? snap.error : null,
    finished: snap.finished === true,
    resumable: snap.resumable === true,
    streamText,
    lastFinishOk:
      typeof snap.lastFinishOk === "boolean" ? snap.lastFinishOk : null,
    diffs,
    pendingPlan,
    deliveryFiles,
    buildLogLines: buildLogLines ?? [],
    stackForkSuggested:
      snap.stackForkSuggested && typeof snap.stackForkSuggested === "object"
        ? (snap.stackForkSuggested as AgentProgress["stackForkSuggested"])
        : null,
    awaiting: snap.awaiting === true || !!pendingPlan,
    awaitingKind,
    planSummary:
      typeof snap.planSummary === "string"
        ? snap.planSummary
        : pendingPlan?.summary ?? null,
  };
}

/** Reidrata progresso mínimo a partir do DB — mini-card persiste após reload/acknowledge. */
export function progressFromAssistantMessage(msg: ChatMessage): AgentProgress | null {
  if (!isAgentJobMessage(msg)) return null;

  const meta = (msg.meta ?? {}) as Record<string, unknown>;
  const cardSnapshot = meta.cardSnapshot;
  if (cardSnapshot && typeof cardSnapshot === "object") {
    return progressFromCardSnapshot(cardSnapshot as Record<string, unknown>, msg);
  }

  const finishedAt = typeof meta.finishedAt === "string";
  const deliveryFiles = Array.isArray(meta.deliveryFiles)
    ? (meta.deliveryFiles as string[])
    : [];
  const currentStep = typeof meta.currentStep === "number" ? meta.currentStep : null;
  const totalSteps = typeof meta.totalSteps === "number" ? meta.totalSteps : null;
  const body = msg.content?.trim() || null;

  const lastFinishOk =
    typeof meta.lastFinishOk === "boolean"
      ? meta.lastFinishOk
      : meta.buildFailed === true
        ? false
        : finishedAt
          ? true
          : null;

  const tools = (msg.toolCalls ?? []).map((tc) => ({
    name: tc.name,
    args:
      typeof tc.args === "string"
        ? ({ path: tc.args } as Record<string, unknown>)
        : ((tc.args as Record<string, unknown> | undefined) ?? {}),
    ok: true as const,
  }));

  const finished = finishedAt || lastFinishOk === true || lastFinishOk === false;
  const timeline = timelineFromMeta(meta);
  const storedPlan = storedPlanFromMessage(msg);
  const planPending = storedPlan?.status === "pending" ? storedPlan.plan : null;

  return {
    ...initialAgentProgress,
    phase: finished ? "done" : null,
    currentStep,
    totalSteps,
    tools,
    timeline,
    finished,
    lastFinishOk,
    streamText: body,
    summary: null,
    deliveryFiles,
    pendingPlan: planPending,
    awaiting: !!planPending,
    awaitingKind: planPending ? "plan_approval" : null,
    planSummary: planPending?.summary ?? null,
  };
}