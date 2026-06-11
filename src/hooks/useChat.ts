import { useEffect, useMemo, useRef } from "react";
import type { AgentProgress } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import { isAssistantRunMaterialized } from "@/lib/assistant-materialized";
import { buildChatThread } from "@/lib/chat";
import { usePendingPlan } from "@/hooks/usePendingPlan";
import type { useAgentRun } from "@/hooks/useAgentRun";

type AgentRun = ReturnType<typeof useAgentRun>;

export type UseChatParams = {
  projectId: string;
  conversationId: string | null | undefined;
  messages: ChatMessage[];
  messagesLoading: boolean;
  agentHasRun: boolean;
  agent: AgentRun;
  running: boolean;
  focusedRunId?: string | null;
};

/**
 * Único ponto que liga mensagens do DB ao agente live.
 */
export function useChat({
  projectId,
  conversationId,
  messages,
  messagesLoading,
  agentHasRun,
  agent,
  running,
  focusedRunId,
}: UseChatParams) {
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
      buildChatThread(messages, progress, {
        activeRunId: agent.activeRunId,
        activeRunStartedAtMs: agent.activeRunStartedAtMs,
        running,
        pendingPlan,
        sessionProgress: progress,
        focusedRunId,
      }),
    [messages, progress, agent.activeRunId, agent.activeRunStartedAtMs, running, pendingPlan, focusedRunId],
  );

  const showEmptyState = useMemo(() => {
    if (messages.length > 0) return false;
    if (agentHasRun) return false;
    if (agent.activeRunId) return false;
    return true;
  }, [messages.length, agentHasRun, agent.activeRunId]);

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
  };
}