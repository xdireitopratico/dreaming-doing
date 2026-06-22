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
import { emitStreamingTelemetry } from "@/lib/streaming-telemetry";

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

/** Peso da timeline para escolher a fonte mais rica (inspector pós-job). */
export function progressTimelineWeight(progress: AgentProgress | null | undefined): number {
  if (!progress) return 0;
  return progress.timeline?.length ?? 0;
}

/** Timeline ou tools — inspector útil mesmo com cardSnapshot.timeline vazio. */
export function inspectorProgressWeight(progress: AgentProgress | null | undefined): number {
  if (!progress) return 0;
  const timeline = progress.timeline?.length ?? 0;
  if (timeline > 0) return timeline;
  return progress.tools?.length ?? 0;
}

export function hasInspectorProgressContent(progress: AgentProgress | null | undefined): boolean {
  return inspectorProgressWeight(progress) > 0;
}

/** Banco tem snapshot terminal com timeline útil para o inspector. */
export function hasInspectorReadySnapshot(msg?: ChatMessage): boolean {
  if (!hasMaterializedCardSnapshot(msg)) return false;
  const meta = (msg!.meta ?? {}) as Record<string, unknown>;
  const snap = meta.cardSnapshot as Record<string, unknown>;
  const timeline = snap.timeline;
  if (Array.isArray(timeline) && timeline.length > 0) return true;
  const streamTail = meta.streamTail;
  if (Array.isArray(streamTail) && streamTail.length > 0) return true;
  const tools = snap.tools;
  if (Array.isArray(tools) && tools.length > 0) return true;
  return false;
}

function findAssistantMessageForRun(runId: string, messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    if (runIdFromAssistantMessage(msg) === runId) return msg;
  }
  return null;
}

export function pickRicherProgress(
  a: AgentProgress | null,
  b: AgentProgress | null,
): AgentProgress | null {
  const wa = inspectorProgressWeight(a);
  const wb = inspectorProgressWeight(b);
  if (!a) return b;
  if (!b) return a;
  return wa >= wb ? a : b;
}

function toolsFromMessageToolCalls(msg: ChatMessage): AgentProgress["tools"] {
  return (msg.toolCalls ?? []).map((tc) => ({
    name: tc.name,
    args:
      typeof tc.args === "string"
        ? ({ path: tc.args } as Record<string, unknown>)
        : ((tc.args as Record<string, unknown> | undefined) ?? {}),
    ok: true as const,
  }));
}

/** Preenche lacunas do cardSnapshot com streamTail, executionLog e toolCalls do meta. */
export function enrichProgressFromMessageMeta(
  progress: AgentProgress,
  meta: Record<string, unknown>,
  msg: ChatMessage,
): AgentProgress {
  let next = progress;

  if (inspectorProgressWeight(next) === 0) {
    const timeline = timelineFromMeta(meta);
    if (timeline.length > 0) {
      next = { ...next, timeline };
    }
  }

  if ((next.tools?.length ?? 0) === 0 && (msg.toolCalls?.length ?? 0) > 0) {
    next = { ...next, tools: toolsFromMessageToolCalls(msg) };
  }

  if (!next.streamText?.trim()) {
    const body = msg.content?.trim();
    if (body) next = { ...next, streamText: body };
  }

  if (next.workingDurationMs == null) {
    const metaDuration =
      typeof meta.workingDurationMs === "number" && meta.workingDurationMs > 0
        ? meta.workingDurationMs
        : typeof meta.latencyThoughtMs === "number" && meta.latencyThoughtMs > 0
          ? meta.latencyThoughtMs
          : null;
    if (metaDuration != null) next = { ...next, workingDurationMs: metaDuration };
  }

  if (!next.narrationText?.trim()) {
    const narration =
      typeof meta.narrationText === "string" && meta.narrationText.trim()
        ? meta.narrationText.trim()
        : null;
    if (narration) next = { ...next, narrationText: narration };
  }

  return next;
}

/** Inspector: ao vivo > DB rico > cópia congelada > DB fraco. */
export function resolveInspectorRunProgress(
  runId: string,
  messages: ChatMessage[],
  opts: {
    activeRunId: string | null;
    liveProgress: AgentProgress;
    frozenProgress?: AgentProgress | null;
  },
): AgentProgress | null {
  if (opts.activeRunId === runId) return opts.liveProgress;

  const historical = resolveHistoricalRunProgress(runId, messages);
  const frozen = opts.frozenProgress ?? null;
  const msg = findAssistantMessageForRun(runId, messages);

  if (msg && hasInspectorReadySnapshot(msg)) {
    const fromDb = historical ?? progressFromAssistantMessage(msg);
    if (fromDb && inspectorProgressWeight(fromDb) > 0) return fromDb;
  }

  const merged = pickRicherProgress(frozen, historical);
  if (merged) return merged;

  return frozen ?? historical;
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
  const runId = typeof nested.runId === "string" ? nested.runId : (fallback?.runId ?? null);
  const projectId =
    typeof nested.projectId === "string" ? nested.projectId : (fallback?.projectId ?? null);
  if (!planId || steps.length === 0 || !runId) return null;

  return {
    planId,
    summary: typeof nested.summary === "string" ? nested.summary : "Plano proposto",
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
    proposedAt: typeof nested.proposedAt === "number" ? nested.proposedAt : Date.now(),
    runId,
    projectId: projectId ?? "",
  };
}

function progressFromCardSnapshot(snap: Record<string, unknown>, msg: ChatMessage): AgentProgress {
  const runId = runIdFromAssistantMessage(msg);
  const projectId = typeof msg.meta?.projectId === "string" ? msg.meta.projectId : undefined;

  // Fase 1.5 — validação de shape do cardSnapshot. Se o backend mudou o
  // contrato (ex: `diffs` passou de `{path, patch}` para `{id, path, before,
  // after, op, timestamp}`), o `useChat` segura o live slot por 45s enquanto
  // o materialization gate espera um shape que nunca chega. Validação early
  // + log de telemetria + tolerância (aceita shapes antigos E novos) evitam o
  // ghost-lock. Sem isso: "mensagem sumiu após o run terminar".
  const diffsArr = Array.isArray(snap.diffs) ? snap.diffs : [];
  const diffsShapeOk = diffsArr.every(
    (d) =>
      d &&
      typeof d === "object" &&
      typeof (d as Record<string, unknown>).id === "string" &&
      typeof (d as Record<string, unknown>).path === "string",
  );
  if (Array.isArray(snap.diffs) && !diffsShapeOk) {
    emitStreamingTelemetry("agent.materialized_shape_mismatch", {
      runId: runId ?? null,
      field: "diffs",
      received: diffsArr.length,
    });
    // Tolerância: descarta diffs malformados em vez de falhar tudo.
    // O inspector ainda renderiza com timeline + tools + streamText.
  }

  const timeline = Array.isArray(snap.timeline) ? (snap.timeline as SSEEvent[]) : [];
  const tools = Array.isArray(snap.tools) ? (snap.tools as AgentProgress["tools"]) : [];
  const diffs = Array.isArray(snap.diffs) ? (snap.diffs as AgentProgress["diffs"]) : [];
  const deliveryFiles = Array.isArray(snap.deliveryFiles) ? (snap.deliveryFiles as string[]) : [];
  const buildLogLines = Array.isArray(snap.buildLogLines)
    ? (snap.buildLogLines as AgentProgress["buildLogLines"])
    : [];

  const pendingPlan =
    pendingPlanFromSnapshot(snap.pendingPlan, {
      runId,
      projectId,
    }) ?? null;

  const awaitingKind: AwaitingKind =
    snap.awaitingKind === "clarify" || (snap.awaitingKind as string | null) === "qualify"
      ? "clarify"
      : snap.awaitingKind === "plan_approval"
        ? "plan_approval"
        : pendingPlan
          ? "plan_approval"
          : null;

  const streamText =
    typeof snap.streamText === "string" && snap.streamText.trim()
      ? snap.streamText
      : msg.content?.trim() || null;

  const narrationText =
    typeof snap.narrationText === "string" && snap.narrationText.trim() ? snap.narrationText : null;

  const workingDurationMs =
    typeof snap.workingDurationMs === "number" && snap.workingDurationMs > 0
      ? snap.workingDurationMs
      : typeof snap.workingDurationMs === "number" && snap.workingDurationMs > 0
        ? snap.workingDurationMs
        : null;

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
    narrationText,
    workingDurationMs,
    lastFinishOk: typeof snap.lastFinishOk === "boolean" ? snap.lastFinishOk : null,
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
    conversational: snap.conversational === true,
    planSummary:
      typeof snap.planSummary === "string" ? snap.planSummary : (pendingPlan?.summary ?? null),
  };
}

/** Progresso histórico de um runId a partir das mensagens do DB (sem frozen). */
export function resolveHistoricalRunProgress(
  runId: string,
  messages: ChatMessage[],
): AgentProgress | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    const rid = runIdFromAssistantMessage(msg);
    if (rid !== runId) continue;
    return progressFromAssistantMessage(msg);
  }
  return null;
}

/** Reidrata progresso mínimo a partir do DB — mini-card persiste após reload/acknowledge. */
export function progressFromAssistantMessage(msg: ChatMessage): AgentProgress | null {
  if (!isAgentJobMessage(msg)) return null;

  const meta = (msg.meta ?? {}) as Record<string, unknown>;
  const cardSnapshot = meta.cardSnapshot;
  if (cardSnapshot && typeof cardSnapshot === "object") {
    return enrichProgressFromMessageMeta(
      progressFromCardSnapshot(cardSnapshot as Record<string, unknown>, msg),
      meta,
      msg,
    );
  }

  const metaDuration =
    typeof meta.workingDurationMs === "number" && meta.workingDurationMs > 0
      ? meta.workingDurationMs
      : typeof meta.workingDurationMs === "number" && meta.workingDurationMs > 0
        ? meta.workingDurationMs
        : null;

  const finishedAt = typeof meta.finishedAt === "string";
  const deliveryFiles = Array.isArray(meta.deliveryFiles) ? (meta.deliveryFiles as string[]) : [];
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

  const narrationText =
    typeof meta.narrationText === "string" && meta.narrationText.trim()
      ? meta.narrationText
      : null;

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
    narrationText,
    workingDurationMs: metaDuration,
    summary: null,
    deliveryFiles,
    pendingPlan: planPending,
    awaiting: !!planPending,
    awaitingKind: planPending ? "plan_approval" : null,
    planSummary: planPending?.summary ?? null,
  };
}
