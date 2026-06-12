import { useEffect, useMemo, useRef } from "react";
import type { AgentProgress } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import { isAssistantRunMaterialized } from "@/lib/assistant-materialized";
import { hasInspectorReadySnapshot } from "@/lib/assistant-run-progress";
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
  const snapshotRestoredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId) return;

    if (prevConversationIdRef.current && prevConversationIdRef.current !== conversationId) {
      agent.resetSession();
      sessionBoundRef.current = null;
      snapshotRestoredRef.current = null;
    }
    prevConversationIdRef.current = conversationId;

    agent.bindSession(projectId, conversationId);
  }, [conversationId, projectId, agent]);

  /** Snapshot só após histórico do DB — evita flash de texto/cards fantasma no F5. */
  useEffect(() => {
    if (!conversationId || messagesLoading) return;
    if (snapshotRestoredRef.current === conversationId) return;

    agent.tryRestoreSnapshot(projectId, conversationId, messages);
    snapshotRestoredRef.current = conversationId;
    sessionBoundRef.current = conversationId;
  }, [conversationId, projectId, agent, messagesLoading, messages]);

  useEffect(() => {
    if (messagesLoading) return;
    for (const m of messages) {
      if (m.role !== "assistant" || !m.runId) continue;
      if (!isAssistantRunMaterialized(m)) continue;
      const rid = m.runId;
      if (agent.activeRunId === rid && !hasInspectorReadySnapshot(m)) continue;
      if (hasInspectorReadySnapshot(m)) {
        agent.clearFrozenRunProgress(rid);
      }
      agent.acknowledgeMaterializedRun(rid);
    }
  }, [messages, messagesLoading, agent]);

  const pendingPlan = usePendingPlan({
    livePlan: agent.progress.pendingPlan,
    messages,
    activeRunId: agent.activeRunId,
  });

  const progress: AgentProgress = useMemo(() => {
    const base = agent.progress;
    if (!pendingPlan) {
      if (base.awaitingKind === "plan_approval" && !base.pendingPlan) {
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

  const thread = useMemo(() => {
    // Mantém thread visível em refetch — só esconde no 1º load sem mensagens.
    if (messagesLoading && messages.length === 0) return [];
    return buildChatThread(messages, progress, {
      activeRunId: agent.activeRunId,
      activeRunStartedAtMs: agent.activeRunStartedAtMs,
      running,
      pendingPlan,
      sessionProgress: progress,
      focusedRunId,
    });
  }, [
    messagesLoading,
    messages,
    progress,
    agent.activeRunId,
    agent.activeRunStartedAtMs,
    running,
    pendingPlan,
    focusedRunId,
  ]);

  const showEmptyState = useMemo(() => {
    if (messagesLoading) return false;
    if (messages.length > 0) return false;
    if (agentHasRun) return false;
    if (agent.activeRunId) return false;
    return true;
  }, [messagesLoading, messages.length, agentHasRun, agent.activeRunId]);

  useEffect(() => {
    if (!agent.activeRunId || !agent.progress.finished) return;
    const runId = agent.activeRunId;
    const timer = window.setTimeout(() => {
      const materialized = messages.find(
        (m) => m.role === "assistant" && m.runId === runId && isAssistantRunMaterialized(m),
      );
      if (materialized && !hasInspectorReadySnapshot(materialized)) return;
      agent.acknowledgeMaterializedRun(runId);
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [agent.activeRunId, agent.progress.finished, agent, messages]);

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