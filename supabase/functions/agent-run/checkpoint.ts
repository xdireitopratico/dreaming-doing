import type { AgentState } from "./types.ts";
import { LoopPhase } from "./types.ts";

export type CheckpointExtra = {
  complexityScore: number;
  maxStepsLimit: number;
};

export type LoadedCheckpoint = {
  phase: LoopPhase;
  state: AgentState;
  extra: CheckpointExtra;
};

function isLoopPhase(v: unknown): v is LoopPhase {
  return typeof v === "string" && Object.values(LoopPhase).includes(v as LoopPhase);
}

export function serializeCheckpointPayload(
  state: AgentState,
  extra: CheckpointExtra,
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
    pendingPlan: state.pendingPlan ?? null,
    complexityScore: extra.complexityScore,
    maxStepsLimit: extra.maxStepsLimit,
  };
}

export function deserializeCheckpointState(
  raw: Record<string, unknown>,
): LoadedCheckpoint | null {
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
      : complexityScore * 5 + 5;

  const state: AgentState = {
    projectId,
    conversationId,
    userId,
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    phase,
    currentStepIndex: typeof raw.currentStepIndex === "number" ? raw.currentStepIndex : 0,
    context: raw.context && typeof raw.context === "object"
      ? (raw.context as AgentState["context"])
      : null,
    intent: raw.intent && typeof raw.intent === "object"
      ? (raw.intent as AgentState["intent"])
      : null,
    plan: raw.plan && typeof raw.plan === "object"
      ? (raw.plan as AgentState["plan"])
      : null,
    validationResults: Array.isArray(raw.validationResults)
      ? (raw.validationResults as AgentState["validationResults"])
      : [],
    executionLog: Array.isArray(raw.executionLog)
      ? raw.executionLog.filter((e): e is string => typeof e === "string")
      : [],
    retryFeedback: typeof raw.retryFeedback === "string" ? raw.retryFeedback : null,
    totalSteps: typeof raw.totalSteps === "number" ? raw.totalSteps : maxStepsLimit,
    pendingPlan: raw.pendingPlan && typeof raw.pendingPlan === "object"
      ? (raw.pendingPlan as AgentState["pendingPlan"])
      : null,
  };

  return {
    phase,
    state,
    extra: { complexityScore, maxStepsLimit },
  };
}

/** Passo inicial ao retomar: não pula step incompleto nem repete step já concluído. */
export function resumeStepStart(phase: LoopPhase, currentStepIndex: number): number {
  if (phase === LoopPhase.EXECUTE_STEP || phase === LoopPhase.VALIDATE_STEP) {
    return Math.max(0, currentStepIndex - 1);
  }
  return Math.max(0, currentStepIndex);
}

export async function loadCheckpoint(
  sb: { from: (table: string) => unknown },
  projectId: string,
  conversationId: string,
): Promise<LoadedCheckpoint | null> {
  const q = sb.from("agent_checkpoints") as {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
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