/**
 * useFlowBuilderChat — Vibe Agent chat (conversas próprias, isolado do boardroom)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "@/lib/chat-types";
import type { ThreadItem } from "@/lib/chat/types";
import type { StoredMessagePart } from "@/lib/chat-attachments";

export type VibeConversation = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta: Record<string, unknown> | null;
  created_at: string;
  conversation_id?: string;
};

function convStorageKey(flowId: string) {
  return `forge-vibe-agent-conv-${flowId}`;
}

function rowToChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp: new Date(row.created_at).getTime(),
    meta: row.meta ?? undefined,
  };
}

function messagesToThreadItems(messages: ChatMessage[], running: boolean): ThreadItem[] {
  const items: ThreadItem[] = messages.map((msg) => {
    if (msg.role === "user") {
      return { kind: "user" as const, message: msg };
    }
    return {
      kind: "assistant" as const,
      message: msg,
      runId: msg.id,
      isActive: false,
      streamText: null,
      finished: true,
    };
  });

  if (running) {
    const last = messages[messages.length - 1];
    if (last?.role === "user") {
      items.push({
        kind: "assistant",
        runId: "__pending__",
        isActive: true,
        streamText: null,
        finished: false,
      });
    }
  }

  return items;
}

export function useFlowBuilderChat({
  flowId,
  enabled,
  nodes,
  edges,
  onApplyPatch,
  onHighlightNodes,
}: {
  flowId: string;
  enabled: boolean;
  nodes?: Node[];
  edges?: Edge[];
  onApplyPatch: (nodes: Node[], edges: Edge[]) => void;
  onHighlightNodes?: (ids: string[]) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<VibeConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const processedIdsRef = useRef<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chatVisibleRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  const requestCancelledRef = useRef(false);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const applyFlowPatch = useCallback((meta: Record<string, unknown> | null | undefined, isNew: boolean) => {
    if (!isNew) return;
    const patch = meta?.flow_patch as {
      nodes?: Node[];
      edges?: Edge[];
      changed_node_ids?: string[];
    } | undefined;
    // B6 FIX: validate patch structure before applying
    if (!patch || !Array.isArray(patch.nodes) || !Array.isArray(patch.edges)) return;
    if (patch.nodes.length === 0 || patch.edges.length === 0) return;
    onApplyPatch(patch.nodes, patch.edges);
    if (patch.changed_node_ids?.length && onHighlightNodes) {
      onHighlightNodes(patch.changed_node_ids);
    }
  }, [onApplyPatch, onHighlightNodes]);

  const ingestRows = useCallback((rows: MessageRow[], isNewStream: boolean) => {
    const added: ChatMessage[] = [];
    for (const row of rows) {
      if (processedIdsRef.current.has(row.id)) continue;
      processedIdsRef.current.add(row.id);
      added.push(rowToChatMessage(row));
      if (row.role === "assistant") {
        applyFlowPatch(row.meta, isNewStream);
        if (isNewStream && !chatVisibleRef.current) {
          setUnreadCount((c) => c + 1);
        }
        setRunning(false);
      }
    }
    if (added.length) {
      setMessages((prev) => [...prev, ...added]);
    }
  }, [applyFlowPatch]);

  const loadMessages = useCallback(async (convId: string) => {
    const { data, error } = await supabase.functions.invoke("vibe-agent-chat", {
      body: { action: "load_messages", conversation_id: convId },
    });
    if (error) throw error;
    const rows = (data as { messages?: MessageRow[] })?.messages ?? [];
    processedIdsRef.current.clear();
    setMessages([]);
    ingestRows(rows, false);
    return rows;
  }, [ingestRows]);

  const refreshConversations = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("vibe-agent-chat", {
      body: { action: "list_conversations", flow_id: flowId },
    });
    if (error) throw error;
    const list = (data as { conversations?: VibeConversation[] })?.conversations ?? [];
    setConversations(list);
    return list;
  }, [flowId]);

  const subscribe = useCallback((convId: string) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel(`vibe-agent-chat-${convId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vibe_agent_messages",
          filter: `conversation_id=eq.${convId}`,
        },
        (payload: { new: MessageRow }) => {
          if (payload.new.conversation_id !== conversationIdRef.current) return;
          ingestRows([payload.new], true);
        },
      )
      .subscribe();

    channelRef.current = channel;
  }, [ingestRows]);

  const selectConversation = useCallback(async (convId: string) => {
    // B1 FIX: update ref BEFORE any async work so realtime/poll handlers see correct convId
    conversationIdRef.current = convId;
    setConversationId(convId);
    localStorage.setItem(convStorageKey(flowId), convId);
    setRunning(false);
    // P2 FIX: reset unread count when user explicitly selects a conversation
    setUnreadCount(0);
    try {
      await loadMessages(convId);
    } catch (err) {
      // B2 FIX: ensure processedIdsRef is cleared even on load failure
      processedIdsRef.current.clear();
      setMessages([]);
      throw err;
    }
    subscribe(convId);
  }, [flowId, loadMessages, subscribe]);

  const startNewConversation = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("vibe-agent-chat", {
      body: { action: "create_conversation", flow_id: flowId },
    });
    if (error) throw error;

    const convId = (data as { conversation_id?: string })?.conversation_id;
    if (!convId) throw new Error("conversation_id missing");

    await refreshConversations();
    await selectConversation(convId);
  }, [flowId, refreshConversations, selectConversation]);

  useEffect(() => {
    if (!enabled || !flowId) return;

    let cancelled = false;

    void (async () => {
      try {
        const list = await refreshConversations();
        if (cancelled) return;

        const savedId = localStorage.getItem(convStorageKey(flowId));
        const pick =
          (savedId && list.some((c) => c.id === savedId) ? savedId : null)
          ?? list[0]?.id
          ?? null;

        if (pick) {
          await selectConversation(pick);
        } else {
          await startNewConversation();
        }

        if (!cancelled) setInitialized(true);
      } catch (err) {
        console.error("[useFlowBuilderChat] init failed:", err);
        if (!cancelled) setInitialized(true);
      }
    })();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, flowId, refreshConversations, selectConversation, startNewConversation]);

  const onSend = useCallback(async (text: string, _mode?: string, _parts?: StoredMessagePart[]) => {
    const trimmed = text.trim();
    if (!trimmed || running) return;

    let convId = conversationId;
    if (!convId) {
      await startNewConversation();
      convId = conversationIdRef.current;
      if (!convId) return;
    }

    // B8 FIX: track cancellation via simple flag (supabase invoke doesn't support AbortSignal)
    requestCancelledRef.current = false;
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("vibe-agent-chat", {
        body: {
          action: "send_message",
          conversation_id: convId,
          message: trimmed,
        },
      });

      // B8 FIX: if request was cancelled via onStop, ignore response
      if (requestCancelledRef.current) return;

      if (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `Erro ao enviar: ${error.message}`,
            timestamp: Date.now(),
          },
        ]);
      }
    } finally {
      // B4 FIX: always reset running, even on network error / exception
      setRunning(false);
    }
  }, [running, conversationId, startNewConversation]);

  const onStop = useCallback(() => {
    // B8 FIX: mark request as cancelled; running will be reset in finally
    requestCancelledRef.current = true;
    setRunning(false);
  }, []);

  const setChatVisible = useCallback((visible: boolean) => {
    chatVisibleRef.current = visible;
    if (visible) setUnreadCount(0);
  }, []);

  return {
    messages,
    threadItems: messagesToThreadItems(messages, running),
    conversations,
    conversationId,
    running,
    initialized,
    unreadCount,
    onSend,
    onStop,
    setChatVisible,
    startNewConversation,
    selectConversation,
  };
}