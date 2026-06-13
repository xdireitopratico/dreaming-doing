import { useEffect } from "react";

import type { ForgeSessionKind, TasteAction } from "@/lib/taste";
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
  runAgent: (explicitKind?: ForgeSessionKind, explicitAction?: TasteAction) => Promise<boolean>;
};

/**
 * Coordinator: sync contagem da fila no mount. Sem watch/drain automático.
 * Job só inicia após ação explícita (enviar, Continuar, aprovar plano, onDrainQueue).
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
}