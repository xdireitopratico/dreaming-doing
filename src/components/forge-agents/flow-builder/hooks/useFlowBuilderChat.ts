/**
 * useFlowBuilderChat — Vibe Agent chat (conversas próprias, isolado do boardroom)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "@/lib/chat-types";
import type { ThreadItem } from "@/lib/chat/types";
import type { StoredMessagePart } from "@/lib/chat-attachments";

const POLL_MIN_MS = 2_000;
const POLL_MAX_MS = 10_000;

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
  onApplyPatch,
  onHighlightNodes,
}: {
  flowId: string;
  enabled: boolean;
  nodes: Node[];
  edges: Edge[];
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
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef(POLL_MIN_MS);
  const chatVisibleRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);

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
    if (!patch?.nodes || !patch?.edges) return;
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
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "vibe_agent_messages",
          filter: `conversation_id=eq.${convId}`,
        },
        (payload: { new: MessageRow }) => {
          if (payload.new.conversation_id !== conversationIdRef.current) return;
          pollIntervalRef.current = POLL_MIN_MS;
          ingestRows([payload.new], true);
        },
      )
      .subscribe();

    channelRef.current = channel;

    if (pollRef.current) clearTimeout(pollRef.current);
    const tick = async () => {
      try {
        const { data } = await supabase
          .from("vibe_agent_messages" as never)
          .select("id, role, content, meta, created_at, conversation_id")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true });

        const rows = (data as (MessageRow & { conversation_id: string })[] | null) ?? [];
        const pending = rows.filter((r) => !processedIdsRef.current.has(r.id));
        if (pending.length) ingestRows(pending, true);
        pollIntervalRef.current = pending.length
          ? POLL_MIN_MS
          : Math.min(Math.round(pollIntervalRef.current * 1.4), POLL_MAX_MS);
      } catch {
        pollIntervalRef.current = POLL_MAX_MS;
      }
      pollRef.current = setTimeout(tick, pollIntervalRef.current);
    };
    pollRef.current = setTimeout(tick, pollIntervalRef.current);
  }, [ingestRows]);

  const selectConversation = useCallback(async (convId: string) => {
    setConversationId(convId);
    localStorage.setItem(convStorageKey(flowId), convId);
    setRunning(false);
    await loadMessages(convId);
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
      if (pollRef.current) clearTimeout(pollRef.current);
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

    setRunning(true);

    const { error } = await supabase.functions.invoke("vibe-agent-chat", {
      body: {
        action: "send_message",
        conversation_id: convId,
        message: trimmed,
      },
    });

    if (error) {
      setRunning(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Erro ao enviar: ${error.message}`,
          timestamp: Date.now(),
        },
      ]);
    } else {
      await refreshConversations();
    }
  }, [running, conversationId, startNewConversation, refreshConversations]);

  const onStop = useCallback(() => {
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