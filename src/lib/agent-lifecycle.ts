import { PENDING_RUN_ID } from "@/lib/pending-run-id";
import type { AgentProgress } from "@/lib/agent-progress";

export type AgentLifecycleStage =
  | "idle"
  | "dispatch"
  | "running"
  | "waiting_user"
  | "finish"
  | "complete"
  | "failed"
  | "cancel"
  | "stale";

export type AgentLifecycleInput = {
  progress: Pick<
    AgentProgress,
    | "awaiting"
    | "awaitingKind"
    | "canceled"
    | "currentStep"
    | "deliveryFiles"
    | "error"
    | "finished"
    | "lastFinishOk"
    | "narrationText"
    | "pendingPlan"
    | "phase"
    | "resumable"
    | "statusHint"
    | "streamText"
    | "timeline"
    | "tools"
  >;
  activeRunId?: string | null;
  running?: boolean;
};

function hasWorkEvidence(progress: AgentLifecycleInput["progress"]): boolean {
  return !!(
    progress.streamText?.trim() ||
    progress.narrationText?.trim() ||
    progress.phase ||
    progress.currentStep != null ||
    (progress.timeline?.length ?? 0) > 0 ||
    (progress.tools?.length ?? 0) > 0 ||
    (progress.deliveryFiles?.length ?? 0) > 0
  );
}

function isStaleError(progress: AgentLifecycleInput["progress"]): boolean {
  const text = [progress.error, progress.statusHint].filter(Boolean).join(" ").toLowerCase();
  return (
    progress.resumable === true ||
    /stale|interromp|timeout|checkpoint|zombie|snapshot/.test(text) ||
    progress.lastFinishOk === false
  );
}

export function resolveAgentLifecycle(input: AgentLifecycleInput): AgentLifecycleStage {
  const { progress } = input;

  if (progress.canceled) return "cancel";
  if (progress.awaiting || progress.awaitingKind) return "waiting_user";
  if (!progress.finished) {
    if (input.running) return "running";
    if (!input.activeRunId || input.activeRunId === PENDING_RUN_ID) return "dispatch";
    return hasWorkEvidence(progress) ? "running" : "dispatch";
  }

  if (progress.lastFinishOk === true) {
    if (
      progress.streamText?.trim() ||
      progress.narrationText?.trim() ||
      hasWorkEvidence(progress)
    ) {
      return "finish";
    }
    return "complete";
  }

  if (progress.lastFinishOk === false) {
    return isStaleError(progress) ? "stale" : "failed";
  }

  if (progress.error?.trim()) return isStaleError(progress) ? "stale" : "failed";

  return "complete";
}

export function lifecycleLabel(stage: AgentLifecycleStage): string {
  switch (stage) {
    case "dispatch":
      return "Conectando…";
    case "running":
      return "Executando";
    case "waiting_user":
      return "Aguardando…";
    case "finish":
      return "Finalizando…";
    case "complete":
      return "Concluído";
    case "failed":
      return "Falhou";
    case "cancel":
      return "Cancelado";
    case "stale":
      return "Interrompido";
    default:
      return "…";
  }
}
