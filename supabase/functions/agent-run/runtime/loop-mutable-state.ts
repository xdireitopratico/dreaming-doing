// runtime/loop-mutable-state.ts — Estado mutável compartilhado do loop (Fase 2.2)

import type { CanonicalBuildSession } from "./build-session.ts";

export type AgentLoopMutableState = {
  lastCheckpointStep: number;
  approvedPlanStepIndex: number;
  toolMissCount: number;
  forceToolsNext: boolean;
  toolsInvoked: boolean;
  consecutiveNoContentReadSteps: number;
  readGateBlockCount: number;
  llmResponseWasStreamed: boolean;
  lastExecutePhaseMessage: string | null;
  lastRunMessageId: string | null;
  lastActivityAt: number;
  buildSession: CanonicalBuildSession | null;
};

export function createAgentLoopMutableState(
  init?: Partial<AgentLoopMutableState>,
): AgentLoopMutableState {
  return {
    lastCheckpointStep: init?.lastCheckpointStep ?? 0,
    approvedPlanStepIndex: init?.approvedPlanStepIndex ?? 0,
    toolMissCount: init?.toolMissCount ?? 0,
    forceToolsNext: init?.forceToolsNext ?? false,
    toolsInvoked: init?.toolsInvoked ?? false,
    consecutiveNoContentReadSteps: init?.consecutiveNoContentReadSteps ?? 0,
    readGateBlockCount: init?.readGateBlockCount ?? 0,
    llmResponseWasStreamed: init?.llmResponseWasStreamed ?? false,
    lastExecutePhaseMessage: init?.lastExecutePhaseMessage ?? null,
    lastRunMessageId: init?.lastRunMessageId ?? null,
    lastActivityAt: init?.lastActivityAt ?? Date.now(),
    buildSession: init?.buildSession ?? null,
  };
}
