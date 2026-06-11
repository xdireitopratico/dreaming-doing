import { useEffect, useMemo, useRef } from "react";
import type { AgentProgress } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import { isAssistantRunMaterialized } from "@/lib/assistant-materialized";
import { buildForgeChatThread } from "@/lib/forge-chat";
import { usePendingPlan } from "@/hooks/usePendingPlan";
import type { useAgentRun } from "@/hooks/useAgentRun";

type AgentRun = ReturnType<typeof useAgentRun>;

export type UseForgeChatParams = {
  projectId: string;
  conversationId: string | null | undefined;
  messages: ChatMessage[];
  messagesLoading: boolean;
  agentHasRun: boolean;
  agent: AgentRun;
  running: boolean;
};

/**
 * Sessão de chat escopada por conversa — único ponto que liga DB + agente live.
 */
export function useForgeChat({
  projectId,
  conversationId,
  messages,
  messagesLoading,
  agentHasRun,
  agent,
  running,
}: UseForgeChatParams) {
  const prevConversationIdRef = useRef<string | null>(null);
  const sessionBoundRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId) return;

    if (prevConversationIdRef.current && prevConversationIdRef.current !== conversationId) {
      agent.resetSession();
      sessionBoundRef.current = null;
    }
    prevConversationIdRef.current = conversationId;

    agent.bindSession(projectId, conversationId);

    if (sessionBoundRef.current !== conversationId) {
      agent.tryRestoreSnapshot(projectId, conversationId);
      sessionBoundRef.current = conversationId;
    }
  }, [conversationId, projectId, agent]);

  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant" || !m.runId) continue;
      if (!isAssistantRunMaterialized(m)) continue;
      agent.acknowledgeMaterializedRun(m.runId);
    }
  }, [messages, agent]);

  const pendingPlan = usePendingPlan({
    livePlan: agent.progress.pendingPlan,
    messages,
    activeRunId: agent.activeRunId,
  });

  const progress: AgentProgress = useMemo(() => {
    const base = agent.progress;
    if (!pendingPlan) {
      if (base.awaitingKind === "plan_approval") {
        return { ...base, awaiting: false, awaitingKind: null };
      }
      return base;
    }
    return {
      ...base,
      pendingPlan,
      awaiting: true,
      awaitingKind: "plan_approval",
    };
  }, [agent.progress, pendingPlan]);

  const thread = useMemo(
    () =>
      buildForgeChatThread(messages, progress, {
        activeRunId: agent.activeRunId,
        running,
      }),
    [messages, progress, agent.activeRunId, running],
  );

  /** Chat vazio sem turno live — welcome ou spinner (nunca tela branca). */
  const showEmptyState = useMemo(() => {
    if (messages.length > 0) return false;
    if (agentHasRun) return false;
    if (agent.activeRunId) return false;
    return true;
  }, [messages.length, agentHasRun, agent.activeRunId]);

  // Libera slot live preso se o DB não materializar (ex.: Taste inline, edge timeout).
  useEffect(() => {
    if (!agent.activeRunId || !agent.progress.finished) return;
    const runId = agent.activeRunId;
    const timer = window.setTimeout(() => {
      agent.acknowledgeMaterializedRun(runId);
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [agent.activeRunId, agent.progress.finished, agent]);

  const agentBusy = !!(
    agent.activeRunId &&
    !agent.progress.finished &&
    !agent.progress.canceled &&
    !agent.progress.awaiting
  );

  return {
    thread,
    progress,
    pendingPlan,
    showEmptyState,
    messagesLoading,
    agentBusy,
    activeRunId: agent.activeRunId,
    activeRunStartedAtMs: agent.activeRunStartedAtMs,
  };
}