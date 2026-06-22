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
import { useAgentRunReconcile } from "./useAgentRunReconcile";

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
 * Coordinator: sync fila no mount, reconcile DB↔UI, auto-run pós-dashboard.
 */
export function useAgentSessionCoordinator({
  projectId,
  conversation,
  agent,
  runAgent,
}: UseAgentSessionCoordinatorParams) {
  const { syncPendingCount, beginPendingTurn } = agent;
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

  useAgentRunReconcile(projectId, conversation?.id, agent);
}