import type { AgentState } from "./types.ts";
import { LoopPhase } from "./types.ts";
import { AGENT_MAX_STEPS } from "./runtime/loop-config.ts";
import type { CanonicalBuildSession } from "./runtime/build-session.ts";

export type OperationSnapshot = {
  touchedPaths: string[];
  directiveEmitted: boolean;
  buildSession: CanonicalBuildSession | null;
  validationGeneration: number;
  operationStartedAt: string;
};

export type CheckpointExtra = {
  complexityScore: number;
  maxStepsLimit: number;
};

export type LoadedCheckpoint = {
  phase: LoopPhase;
  state: AgentState;
  extra: CheckpointExtra;
  operation: OperationSnapshot;
};

function isLoopPhase(v: unknown): v is LoopPhase {
  return typeof v === "string" && Object.values(LoopPhase).includes(v as LoopPhase);
}

function parseBuildSession(raw: unknown): CanonicalBuildSession | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.runId !== "string" || typeof o.phase !== "string") return null;
  return raw as CanonicalBuildSession;
}

export function defaultOperationSnapshot(
  overrides?: Partial<OperationSnapshot>,
): OperationSnapshot {
  return {
    touchedPaths: overrides?.touchedPaths ?? [],
    directiveEmitted: overrides?.directiveEmitted ?? false,
    buildSession: overrides?.buildSession ?? null,
    validationGeneration: overrides?.validationGeneration ?? 0,
    operationStartedAt: overrides?.operationStartedAt ?? new Date().toISOString(),
  };
}

export function parseOperationSnapshot(raw: Record<string, unknown>): OperationSnapshot {
  const touchedPaths = Array.isArray(raw.touchedPaths)
    ? raw.touchedPaths.filter((p): p is string => typeof p === "string")
    : [];
  return defaultOperationSnapshot({
    touchedPaths,
    directiveEmitted: raw.directiveEmitted === true,
    buildSession: parseBuildSession(raw.buildSession),
    validationGeneration: typeof raw.validationGeneration === "number"
      ? raw.validationGeneration
      : 0,
    operationStartedAt: typeof raw.operationStartedAt === "string"
      ? raw.operationStartedAt
      : new Date().toISOString(),
  });
}

export function serializeCheckpointPayload(
  state: AgentState,
  extra: CheckpointExtra,
  operation: OperationSnapshot,
): Record<string, unknown> {
  return {
    projectId: state.projectId,
    conversationId: state.conversationId,
    userId: state.userId,
    messages: state.messages,
    phase: state.phase,
    currentStepIndex: state.currentStepIndex,
    context: state.context,
    intent: state.intent,
    plan: state.plan,
    validationResults: state.validationResults,
    executionLog: state.executionLog,
    retryFeedback: state.retryFeedback,
    totalSteps: state.totalSteps,
    complexityScore: extra.complexityScore,
    maxStepsLimit: extra.maxStepsLimit,
    touchedPaths: operation.touchedPaths,
    directiveEmitted: operation.directiveEmitted,
    buildSession: operation.buildSession,
    validationGeneration: operation.validationGeneration,
    operationStartedAt: operation.operationStartedAt,
  };
}

export function deserializeCheckpointState(raw: Record<string, unknown>): LoadedCheckpoint | null {
  const projectId = raw.projectId;
  const conversationId = raw.conversationId;
  const userId = raw.userId;
  if (
    typeof projectId !== "string" ||
    typeof conversationId !== "string" ||
    typeof userId !== "string"
  ) {
    return null;
  }

  const phase = isLoopPhase(raw.phase) ? raw.phase : LoopPhase.EXECUTE_STEP;
  const complexityScore =
    typeof raw.complexityScore === "number" && raw.complexityScore >= 1 && raw.complexityScore <= 5
      ? raw.complexityScore
      : 3;
  const maxStepsLimit =
    typeof raw.maxStepsLimit === "number" && raw.maxStepsLimit > 0
      ? raw.maxStepsLimit
      : AGENT_MAX_STEPS;

  const state: AgentState = {
    projectId,
    conversationId,
    userId,
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    phase,
    currentStepIndex: typeof raw.currentStepIndex === "number" ? raw.currentStepIndex : 0,
    context:
      raw.context && typeof raw.context === "object"
        ? (raw.context as AgentState["context"])
        : null,
    intent:
      raw.intent && typeof raw.intent === "object" ? (raw.intent as AgentState["intent"]) : null,
    plan: raw.plan && typeof raw.plan === "object" ? (raw.plan as AgentState["plan"]) : null,
    validationResults: Array.isArray(raw.validationResults)
      ? (raw.validationResults as AgentState["validationResults"])
      : [],
    executionLog: Array.isArray(raw.executionLog)
      ? raw.executionLog.filter((e): e is string => typeof e === "string")
      : [],
    retryFeedback: typeof raw.retryFeedback === "string" ? raw.retryFeedback : null,
    totalSteps: typeof raw.totalSteps === "number" ? raw.totalSteps : maxStepsLimit,
  };

  return {
    phase,
    state,
    extra: { complexityScore, maxStepsLimit },
    operation: parseOperationSnapshot(raw),
  };
}

/** Passo inicial ao retomar: continua no step salvo (não repete o anterior). */
export function resumeStepStart(phase: LoopPhase, currentStepIndex: number): number {
  void phase;
  return Math.max(0, currentStepIndex);
}

export async function loadCheckpoint(
  sb: { from: (table: string) => unknown },
  projectId: string,
  conversationId: string,
): Promise<LoadedCheckpoint | null> {
  const q = sb.from("agent_checkpoints") as {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        eq: (
          col: string,
          val: string,
        ) => {
          maybeSingle: () => Promise<{ data: { phase?: string; state?: unknown } | null }>;
        };
      };
    };
  };

  const { data } = await q
    .select("phase, state")
    .eq("project_id", projectId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (!data?.state || typeof data.state !== "object") return null;

  const loaded = deserializeCheckpointState(data.state as Record<string, unknown>);
  if (!loaded) return null;

  if (isLoopPhase(data.phase)) {
    loaded.phase = data.phase;
  }

  return loaded;
}

/** Remove checkpoint órfão (ex.: após plan terminal) — evita resume fantasma em BUILD. */
export async function clearConversationCheckpoint(
  sb: { from: (table: string) => unknown },
  projectId: string,
  conversationId: string,
): Promise<void> {
  const q = sb.from("agent_checkpoints") as {
    delete: () => {
      eq: (
        col: string,
        val: string,
      ) => {
        eq: (col: string, val: string) => Promise<unknown>;
      };
    };
  };
  try {
    await q.delete().eq("project_id", projectId).eq("conversation_id", conversationId);
  } catch {
    /* best-effort */
  }
}