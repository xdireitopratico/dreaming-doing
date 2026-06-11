import { useMemo } from "react";
import type { AgentProgress } from "@/lib/agent-progress";
import type { useAgentRun } from "@/hooks/useAgentRun";

export type ActiveRunState = {
  progress: AgentProgress;
  activeRunId: string | null;
  activeRunStartedAtMs: number | null;
  connected: boolean;
  isPendingRun: boolean;
  /** Agente com run ativa e ainda não terminal/aguardando usuário. */
  running: boolean;
};

export function selectActiveRun(agent: ReturnType<typeof useAgentRun>): ActiveRunState {
  const running = !!(
    agent.activeRunId &&
    !agent.progress.finished &&
    !agent.progress.canceled &&
    !agent.progress.awaiting
  );

  return {
    progress: agent.progress,
    activeRunId: agent.activeRunId,
    activeRunStartedAtMs: agent.activeRunStartedAtMs,
    connected: agent.connected,
    isPendingRun: agent.isPendingRun,
    running,
  };
}

/** Facade tipada do slice de run ativa — UI não depende de frozenRuns. */
export function useActiveRun(agent: ReturnType<typeof useAgentRun>): ActiveRunState {
  return useMemo(
    () => selectActiveRun(agent),
    [
      agent.progress,
      agent.activeRunId,
      agent.activeRunStartedAtMs,
      agent.connected,
      agent.isPendingRun,
    ],
  );
}
