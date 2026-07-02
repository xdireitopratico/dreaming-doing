import { useMemo } from "react";
import type { AgentProgress } from "@/lib/agent-progress";
import type { useAgentRun } from "@/hooks/useAgentRun";
import { isAgentSessionRunning, type AgentSessionStage } from "@/lib/agent-session-stage";

export type ActiveRunState = {
  progress: AgentProgress;
  activeRunId: string | null;
  activeRunStartedAtMs: number | null;
  connected: boolean;
  isPendingRun: boolean;
  sessionStage: AgentSessionStage;
  /** Agente com run ativa e ainda não terminal/aguardando usuário. */
  running: boolean;
};

export function selectActiveRun(agent: ReturnType<typeof useAgentRun>): ActiveRunState {
  const running = isAgentSessionRunning(agent.sessionStage);

  return {
    progress: agent.progress,
    activeRunId: agent.activeRunId,
    activeRunStartedAtMs: agent.activeRunStartedAtMs,
    connected: agent.connected,
    isPendingRun: agent.isPendingRun,
    sessionStage: agent.sessionStage,
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
      agent.sessionStage,
    ],
  );
}
