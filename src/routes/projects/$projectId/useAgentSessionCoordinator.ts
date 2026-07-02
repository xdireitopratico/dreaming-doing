import { useEffect, useRef } from "react";

import type { AgentComposerMode } from "@/lib/chat-types";
import { loadComposerMode } from "@/lib/composer-mode";
import type { ForgeSessionKind, TasteAction } from "@/lib/taste";
import {
  clearPendingAgentRun,
  hasAutoRunAttempted,
  markAutoRunAttempted,
  peekPendingAgentRun,
} from "@/lib/agent-auto-run";
import type { useAgentRun } from "@/hooks/useAgentRun";
type AgentRun = ReturnType<typeof useAgentRun>;

type TasteQuota = {
  tasteChatRemaining: number;
  tasteStartRemaining: number;
  hasUserLlmKey: boolean;
};

type UseAgentSessionCoordinatorParams = {
  projectId: string;
  conversation: { id: string } | null | undefined;
  agent: AgentRun;
  running: boolean;
  tasteQuota: TasteQuota;
  runAgent: (
    explicitKind?: ForgeSessionKind,
    explicitAction?: TasteAction,
    explicitMode?: AgentComposerMode,
  ) => Promise<boolean>;
};

/**
 * Coordinator: sync fila no mount, resync DB↔UI e auto-run pós-dashboard.
 */
export function useAgentSessionCoordinator({
  projectId,
  conversation,
  agent,
  runAgent,
}: UseAgentSessionCoordinatorParams) {
  const { syncPendingCount, beginPendingTurn, progress, activeRunId, isPendingRun, attachLiveRun } =
    agent;
  const autoRunStartedRef = useRef(false);

  useEffect(() => {
    if (!conversation?.id) return;
    void syncPendingCount(projectId, conversation.id);
  }, [conversation?.id, projectId, syncPendingCount]);

  useEffect(() => {
    if (!conversation?.id || !agent.progress.finished) return;
    void syncPendingCount(projectId, conversation.id);
  }, [agent.progress.finished, conversation?.id, projectId, syncPendingCount]);

  useEffect(() => {
    if (!conversation?.id) return;
    if (isPendingRun) return;
    let alive = true;

    const tryAttach = async (): Promise<boolean> => {
      if (!alive) return false;
      if (activeRunId) return true;
      const runId = await attachLiveRun(projectId, conversation.id, { resetProgress: false });
      if (!alive) return false;
      if (!runId) return false;
      return true;
    };

    void tryAttach();

    return () => {
      alive = false;
    };
  }, [projectId, conversation?.id, attachLiveRun, activeRunId, progress.finished, isPendingRun]);

  useEffect(() => {
    if (!conversation?.id) return;
    if (!progress.finished) return;
    if ((progress.pendingQueueCount ?? 0) <= 0) return;
    if (activeRunId) return;

    const attachQueuedRun = async () => {
      const runId = await attachLiveRun(projectId, conversation.id, { resetProgress: false });
      if (!runId) return;
      void syncPendingCount(projectId, conversation.id);
    };

    void attachQueuedRun();
  }, [
    projectId,
    conversation?.id,
    progress.finished,
    progress.pendingQueueCount,
    activeRunId,
    attachLiveRun,
    syncPendingCount,
  ]);

  useEffect(() => {
    const conversationId = conversation?.id;
    if (!conversationId) return;
    if (autoRunStartedRef.current) return;
    if (!peekPendingAgentRun(projectId, conversationId)) return;
    if (hasAutoRunAttempted(projectId, conversationId)) {
      clearPendingAgentRun(projectId);
      return;
    }
    if (agent.activeRunId && !agent.progress.finished) return;

    autoRunStartedRef.current = true;
    markAutoRunAttempted(projectId, conversationId);
    clearPendingAgentRun(projectId);

    beginPendingTurn();
    void runAgent(undefined, undefined, loadComposerMode(projectId));
  }, [
    projectId,
    conversation?.id,
    agent.activeRunId,
    agent.progress.finished,
    beginPendingTurn,
    runAgent,
  ]);

  // Reconcile logic now lives here as the single coordinator path.
}
