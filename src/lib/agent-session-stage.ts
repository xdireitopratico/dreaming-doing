import type { AgentProgress } from "@/lib/agent-progress";
import {
  resolveAgentLifecycle,
  type AgentLifecycleInput,
  type AgentLifecycleStage,
} from "@/lib/agent-lifecycle";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";

export type AgentSessionStage =
  | "idle"
  | "pending"
  | "running"
  | "reconnecting"
  | "awaiting"
  | "materializing"
  | "complete"
  | "failed"
  | "canceled"
  | "stale";

type AgentSessionStageInput = {
  progress: AgentLifecycleInput["progress"];
  activeRunId?: string | null;
  running?: boolean;
  connectionState?: AgentProgress["connectionState"];
};

function terminalStageFromLifecycle(stage: AgentLifecycleStage): AgentSessionStage {
  switch (stage) {
    case "cancel":
      return "canceled";
    case "failed":
      return "failed";
    case "stale":
      return "stale";
    case "complete":
    case "finish":
      return "complete";
    default:
      return "idle";
  }
}

export function resolveAgentSessionStage(input: AgentSessionStageInput): AgentSessionStage {
  const { progress, activeRunId, running, connectionState } = input;

  if (activeRunId === PENDING_RUN_ID && !progress.finished) return "pending";
  if (!progress.finished && connectionState === "reconnecting") return "reconnecting";

  const lifecycle = resolveAgentLifecycle({ progress, activeRunId, running });

  if (lifecycle === "waiting_user") return "awaiting";
  if (!progress.finished) return lifecycle === "running" ? "running" : "pending";

  if (activeRunId && activeRunId !== PENDING_RUN_ID) return "materializing";

  return terminalStageFromLifecycle(lifecycle);
}

export function isAgentSessionRunning(stage: AgentSessionStage): boolean {
  return stage === "pending" || stage === "running" || stage === "reconnecting";
}
