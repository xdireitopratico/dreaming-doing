import type { AgentProgress } from "@/lib/agent-progress";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";

export type EditorExecutionStage =
  | "idle"
  | "submitting"
  | "live_run"
  | "awaiting_user"
  | "terminal";

type EditorExecutionStateInput = {
  activeRunId?: string | null;
  progress: Pick<
    AgentProgress,
    | "awaiting"
    | "awaitingKind"
    | "buildLogLines"
    | "canceled"
    | "currentStep"
    | "deliveryFiles"
    | "diffs"
    | "finished"
    | "narrationText"
    | "phase"
    | "streamText"
    | "timeline"
    | "tools"
  >;
};

function hasLiveRunEvidence(progress: EditorExecutionStateInput["progress"]): boolean {
  return !!(
    progress.phase ||
    progress.currentStep != null ||
    progress.streamText?.trim() ||
    progress.narrationText?.trim() ||
    (progress.timeline?.length ?? 0) > 0 ||
    (progress.tools?.length ?? 0) > 0 ||
    (progress.diffs?.length ?? 0) > 0 ||
    (progress.deliveryFiles?.length ?? 0) > 0 ||
    (progress.buildLogLines?.length ?? 0) > 0
  );
}

export function resolveEditorExecutionStage(
  input: EditorExecutionStateInput,
): EditorExecutionStage {
  const activeRunId = input.activeRunId ?? null;
  const pendingTurn = activeRunId === PENDING_RUN_ID;
  const liveRunAttached = !!activeRunId && activeRunId !== PENDING_RUN_ID;
  const awaiting = !!(input.progress.awaiting || input.progress.awaitingKind);

  if (awaiting) return "awaiting_user";
  if (pendingTurn && !input.progress.finished) return "submitting";
  if (
    liveRunAttached &&
    !input.progress.finished &&
    !input.progress.canceled &&
    hasLiveRunEvidence(input.progress)
  ) {
    return "live_run";
  }
  if (liveRunAttached && !input.progress.finished && !input.progress.canceled) {
    return "submitting";
  }
  if (input.progress.finished) return "terminal";
  return "idle";
}

export function isEditorExecutionTurnActive(stage: EditorExecutionStage): boolean {
  return stage === "submitting" || stage === "live_run";
}

export function isEditorExecutionLiveRun(stage: EditorExecutionStage): boolean {
  return stage === "live_run";
}
