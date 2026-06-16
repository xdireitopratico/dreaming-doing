// ============================================================================
// useVibeChat — Hook para canal limpo de conversação com Vibe Agent
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { vibeAgent } from '@/lib/vibe-agent-core';
import type {
  AtomicPlan,
  ChatEvent,
  ClosureData,
  Conversation,
  CuratedMessage,
  MinicardState,
} from '@/lib/vibe-agent-events';
import { topologicalSort } from '@/lib/vibe-agent-events';

interface UseVibeChatOptions {
  flowId: string;
  enabled: boolean;
  conversationId?: string | null;
  onNewConversation?: (id: string) => void;
}

export function useVibeChat({
  flowId,
  enabled,
  conversationId,
  onNewConversation,
}: UseVibeChatOptions) {
  const [messages, setMessages] = useState<CuratedMessage[]>([]);
  const [currentMinicard, setCurrentMinicard] = useState<MinicardState | null>(null);
  const [currentPlan, setCurrentPlan] = useState<AtomicPlan | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(conversationId ?? null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [initialized, setInitialized] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // ---------------------------------------------------------------------------
  // MESSAGE HELPERS
  // ---------------------------------------------------------------------------
  const appendMessage = useCallback((msg: Omit<CuratedMessage, 'id'>) => {
    setMessages((prev) => [...prev, { ...msg, id: crypto.randomUUID() }]);
  }, []);

  // ---------------------------------------------------------------------------
  // ENSURE CONVERSATION
  // ---------------------------------------------------------------------------
  const refreshConversations = useCallback(async () => {
    const list = await vibeAgent.listConversations(flowId);
    setConversations(list);
    return list;
  }, [flowId]);

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (convId) return convId;

    const newConvId = await vibeAgent.createConversation(flowId);
    setConvId(newConvId);
    onNewConversation?.(newConvId);
    await refreshConversations();
    return newConvId;
  }, [convId, flowId, onNewConversation, refreshConversations]);

  // ---------------------------------------------------------------------------
  // SEND
  // ---------------------------------------------------------------------------
  const send = useCallback(async (text: string) => {
    if (!text.trim() || running || !enabled) return;

    const currentConvId = await ensureConversation();
    const idempotencyKey = crypto.randomUUID();
    const userMessage: CuratedMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setRunning(true);
    setError(null);
    setCurrentMinicard(null);
    setCurrentPlan(null);

    abortRef.current = new AbortController();

    try {
      const { chatStream } = await vibeAgent.sendMessage(currentConvId, text.trim(), {
        idempotencyKey,
        signal: abortRef.current.signal,
      });

      for await (const event of chatStream) {
        if (abortRef.current?.signal.aborted) break;
        handleChatEvent(event, appendMessage, setCurrentMinicard, setCurrentPlan);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;

      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      appendMessage({
        role: 'assistant',
        content: `Erro: ${message}`,
        timestamp: Date.now(),
        meta: { kind: 'error' },
      });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [running, enabled, ensureConversation, appendMessage]);

  // ---------------------------------------------------------------------------
  // STOP
  // ---------------------------------------------------------------------------
  const stop = useCallback(() => {
    if (convId) {
      vibeAgent.stopAll(convId);
    }
    abortRef.current?.abort();
    setRunning(false);
    setCurrentMinicard(null);
    setCurrentPlan(null);
  }, [convId]);

  // ---------------------------------------------------------------------------
  // CONVERSATION MANAGEMENT
  // ---------------------------------------------------------------------------
  const selectConversation = useCallback(async (id: string) => {
    setConvId(id);
    setMessages([]);
    setCurrentMinicard(null);
    setCurrentPlan(null);
    setError(null);
    // TODO: Carregar histórico via vibeAgent.listMessages(id) quando implementado
  }, []);

  const startNewConversation = useCallback(async () => {
    const id = await vibeAgent.createConversation(flowId);
    setConvId(id);
    setMessages([]);
    setCurrentMinicard(null);
    setCurrentPlan(null);
    onNewConversation?.(id);
    await refreshConversations();
    return id;
  }, [flowId, onNewConversation, refreshConversations]);

  // ---------------------------------------------------------------------------
  // CLEANUP
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled || !flowId) return;

    let cancelled = false;

    (async () => {
      try {
        const list = await refreshConversations();
        if (cancelled) return;

        const savedId = typeof window !== 'undefined' ? localStorage.getItem(`forge-vibe-agent-conv-${flowId}`) : null;
        const pick = (savedId && list.some((c) => c.id === savedId) ? savedId : null) ?? list[0]?.id ?? null;

        if (pick) {
          await selectConversation(pick);
        } else if (list.length === 0) {
          await startNewConversation();
        }

        if (!cancelled) setInitialized(true);
      } catch (err) {
        console.error('[useVibeChat] init failed:', err);
        if (!cancelled) setInitialized(true);
      }
    })();

    return () => {
      cancelled = true;
      if (convId) vibeAgent.stopAll(convId);
      abortRef.current?.abort();
    };
  }, [convId, enabled, flowId, refreshConversations, selectConversation, startNewConversation]);

  return {
    messages,
    currentMinicard,
    currentPlan,
    running,
    error,
    conversationId: convId,
    conversations,
    initialized,
    send,
    stop,
    selectConversation,
    startNewConversation,
    clearError: () => setError(null),
  };
}

// ---------------------------------------------------------------------------
// EVENT HANDLER
// ---------------------------------------------------------------------------
function handleChatEvent(
  event: ChatEvent,
  appendMessage: (msg: Omit<CuratedMessage, 'id'>) => void,
  setCurrentMinicard: Dispatch<SetStateAction<MinicardState | null>>,
  setCurrentPlan: Dispatch<SetStateAction<AtomicPlan | null>>,
) {
  switch (event.type) {
    case 'chat_intro':
      appendMessage({
        role: 'assistant',
        content: event.text,
        timestamp: event.timestamp,
        meta: { kind: 'intro' },
      });
      break;

    case 'chat_loop_step':
      setCurrentMinicard((prev) => {
        const steps = prev?.steps.map((s) =>
          s.id === event.stepId ? { ...s, status: event.status } : s,
        ) || [{ id: event.stepId, label: event.label, status: event.status }];

        return {
          id: prev?.id || event.requestId,
          title: prev?.title || 'Analisando...',
          steps,
          startedAt: prev?.startedAt || Date.now(),
        };
      });
      break;

    case 'chat_plan_approved': {
      const orderedTasks = topologicalSort(event.tasks);
      setCurrentPlan({
        id: event.planId,
        title: event.title,
        tasks: orderedTasks,
        createdAt: event.timestamp,
      });
      setCurrentMinicard(null);
      break;
    }

    case 'chat_task_update':
      setCurrentPlan((prev) => prev ? {
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === event.taskId ? { ...t, status: event.status, output: event.output } : t,
        ),
      } : null);
      break;

    case 'chat_closure': {
      const closure: ClosureData = {
        summary: event.summary,
        remaining: event.remaining,
        nextSteps: event.nextSteps,
        artifacts: event.artifacts || [],
      };
      appendMessage({
        role: 'assistant',
        content: event.summary,
        timestamp: event.timestamp,
        meta: { kind: 'closure', closure },
      });
      setCurrentPlan(null);
      setCurrentMinicard(null);
      break;
    }

    case 'chat_error':
      if (event.recoverable) {
        appendMessage({
          role: 'assistant',
          content: event.message + (event.suggestion ? ` — ${event.suggestion}` : ''),
          timestamp: event.timestamp,
          meta: { kind: 'error' },
        });
      }
      break;

    case 'checkpoint':
      // Ignorado no chat — usado apenas para replay
      break;
  }
}