import { useEffect } from "react";

import type { ForgeSessionKind, TasteAction } from "@/lib/taste";
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
  runAgent: (explicitKind?: ForgeSessionKind, explicitAction?: TasteAction) => Promise<boolean>;
};

/**
 * Coordinator: sync fila no mount, reconcile DB↔UI, watch pós-drain server-side.
 * Envio manual / Continuar / aprovar plano continuam explícitos; drain Inngest auto-anexa.
 */
export function useAgentSessionCoordinator({
  projectId,
  conversation,
  agent,
}: UseAgentSessionCoordinatorParams) {
  const { syncPendingCount } = agent;

  useEffect(() => {
    if (!conversation?.id) return;
    void syncPendingCount(projectId, conversation.id);
  }, [conversation?.id, projectId, syncPendingCount]);

  useEffect(() => {
    if (!conversation?.id || !agent.progress.finished) return;
    void syncPendingCount(projectId, conversation.id);
  }, [agent.progress.finished, conversation?.id, projectId, syncPendingCount]);

  useAgentRunReconcile(projectId, conversation?.id, agent);
}