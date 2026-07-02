import type { AgentProgress } from "@/lib/agent-progress";
import type { useAgentRun } from "@/hooks/useAgentRun";
import { type AgentSessionStage } from "@/lib/agent-session-stage";
import {
  isEditorExecutionLiveRun,
  isEditorExecutionTurnActive,
  resolveEditorExecutionStage,
  type EditorExecutionStage,
} from "@/lib/editor-execution-state";

export type ActiveRunState = {
  progress: AgentProgress;
  activeRunId: string | null;
  activeRunStartedAtMs: number | null;
  connected: boolean;
  isPendingRun: boolean;
  sessionStage: AgentSessionStage;
  executionStage: EditorExecutionStage;
  /** Turno ativo no editor: submitting local ou run viva já evidenciada. */
  turnActive: boolean;
  /** Run viva materializada/evidenciada — única fase que pode armar Stop. */
  running: boolean;
  submitting: boolean;
};

export function selectActiveRun(agent: ReturnType<typeof useAgentRun>): ActiveRunState {
  const executionStage = resolveEditorExecutionStage({
    activeRunId: agent.activeRunId,
    progress: agent.progress,
  });
  const running = isEditorExecutionLiveRun(executionStage);
  const turnActive = isEditorExecutionTurnActive(executionStage);

  return {
    progress: agent.progress,
    activeRunId: agent.activeRunId,
    activeRunStartedAtMs: agent.activeRunStartedAtMs,
    connected: agent.connected,
    isPendingRun: agent.isPendingRun,
    sessionStage: agent.sessionStage,
    executionStage,
    turnActive,
    running,
    submitting: executionStage === "submitting",
  };
}

/** Facade tipada do slice de run ativa — UI não depende de frozenRuns. */
export function useActiveRun(agent: ReturnType<typeof useAgentRun>): ActiveRunState {
  return selectActiveRun(agent);
}
