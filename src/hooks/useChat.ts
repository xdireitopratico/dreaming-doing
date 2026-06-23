import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AgentProgress } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import { canReleaseLiveSlot } from "@/lib/assistant-materialized";
import { hasInspectorReadySnapshot } from "@/lib/assistant-run-progress";
import { buildChatThread } from "@/lib/chat";
import { usePendingPlan } from "@/hooks/usePendingPlan";
import { emitStreamingTelemetry } from "@/lib/streaming-telemetry";
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

    let cancelled = false;
    void agent.tryRestoreSnapshot(projectId, conversationId, messages).then(() => {
      if (!cancelled) {
        snapshotRestoredRef.current = conversationId;
        sessionBoundRef.current = conversationId;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, projectId, agent, messagesLoading, messages]);

  useEffect(() => {
    if (messagesLoading) return;
    for (const m of messages) {
      if (m.role !== "assistant" || !m.runId) continue;
      if (!canReleaseLiveSlot(m)) continue;
      const rid = m.runId;
      if (hasInspectorReadySnapshot(m)) {
        agent.clearFrozenRunProgress(rid);
      }
      agent.acknowledgeMaterializedRun(rid);
    }
  }, [messages, messagesLoading, agent]);

  useEffect(() => {
    if (!agent.activeRunId || !agent.progress.finished) return;
    const runId = agent.activeRunId;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => {
      const materialized = messages.find(
        (m) => m.role === "assistant" && m.runId === runId && canReleaseLiveSlot(m),
      );
      if (!materialized) {
        emitStreamingTelemetry("agent.materialized_release_pending", {
          runId,
          elapsedMs: Date.now() - startedAt,
        });
        agent.acknowledgeMaterializedRun(runId);
        return;
      }
      agent.acknowledgeMaterializedRun(runId);
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [agent.activeRunId, agent.progress.finished, agent, messages]);

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

  const agentBusy = !!(
    agent.activeRunId &&
    !agent.progress.finished &&
    !agent.progress.canceled &&
    !agent.progress.awaiting
  );

  // Fase 1.9 — expõe busyReason pro composer. "running" = mesma conversa,
  // turno atual. "other_conversation" = outra aba/dispositivo tomando o
  // lock. "zombie" = run travou (status pending/running mas finished sem
  // lastFinishOk ou stale stream detectado). O composer decide se mostra
  // chip "Tomar controle".
  const busyReason: "running" | "zombie" | "other_conversation" | null = agentBusy
    ? (progress?.finished === true && progress?.lastFinishOk === false
        ? "zombie"
        : "running")
    : null;

  const takeOver = useCallback(() => {
    emitStreamingTelemetry("agent.dual_tab_detected", {
      activeRunId: agent.activeRunId,
    });
    void agent.stop();
  }, [agent]);

  return {
    thread,
    progress,
    pendingPlan,
    messagesLoading,
    agentBusy,
    activeRunId: agent.activeRunId,
    busyReason,
    takeOver,
  };
}