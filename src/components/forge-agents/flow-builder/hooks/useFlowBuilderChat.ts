/**
 * useFlowBuilderChat — Vibe editing chat for Flow Builder (intent: modify)
 * Reuses ChatMessage format; backend: prometheus-builder + prometheus_build_turns.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "@/lib/chat-types";
import type { ThreadItem } from "@/lib/chat/types";
import type { StoredMessagePart } from "@/lib/chat-attachments";

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const POLL_MIN_MS = 2_000;
const POLL_MAX_MS = 12_000;

type TurnRow = {
  id: string;
  agent_key: string;
  content: string;
  message_type: string;
  output_data: Record<string, unknown> | null;
  created_at: string;
};

function turnToMessages(row: TurnRow): ChatMessage[] {
  const ts = new Date(row.created_at).getTime();
  if (row.message_type === "user_input" || row.agent_key === "user") {
    return [{
      id: row.id,
      role: "user",
      content: row.content,
      timestamp: ts,
    }];
  }
  return [{
    id: row.id,
    role: "assistant",
    content: row.content,
    timestamp: ts,
    meta: row.output_data ? { outputData: row.output_data } : undefined,
  }];
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
    } else if (last?.role === "assistant") {
      const lastItem = items[items.length - 1];
      if (lastItem?.kind === "assistant") {
        lastItem.isActive = true;
        lastItem.finished = false;
      }
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
  nodes: Node[];
  edges: Edge[];
  onApplyPatch: (nodes: Node[], edges: Edge[]) => void;
  onHighlightNodes?: (ids: string[]) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [initialized, setInitialized] = useState(false);

  const processedTurnIdsRef = useRef<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef(POLL_MIN_MS);
  const chatVisibleRef = useRef(false);

  const applyFlowPatch = useCallback((outputData: Record<string, unknown> | null) => {
    const patch = outputData?.flow_patch as {
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

  const processTurn = useCallback((row: TurnRow, isNew: boolean) => {
    if (processedTurnIdsRef.current.has(row.id)) return false;
    processedTurnIdsRef.current.add(row.id);

    const newMsgs = turnToMessages(row);
    setMessages((prev) => [...prev, ...newMsgs]);

    if (row.output_data?.flow_patch) {
      applyFlowPatch(row.output_data);
    }

    if (isNew && row.agent_key !== "user" && !chatVisibleRef.current) {
      setUnreadCount((c) => c + 1);
    }

    if (row.agent_key !== "user") {
      setRunning(false);
    }

    return true;
  }, [applyFlowPatch]);

  const hydrateTurns = useCallback(async (sid: string) => {
    const { data } = await supabase
      .from("prometheus_build_turns" as never)
      .select("id, agent_key, content, message_type, output_data, created_at")
      .eq("session_id", sid)
      .order("created_at", { ascending: true });

    let count = 0;
    for (const row of (data as TurnRow[] | null) || []) {
      if (processTurn(row, false)) count += 1;
    }
    return count;
  }, [processTurn]);

  const schedulePoll = useCallback((sid: string) => {
    if (pollRef.current) clearTimeout(pollRef.current);

    const tick = async () => {
      try {
        const { data } = await supabase
          .from("prometheus_build_turns" as never)
          .select("id, agent_key, content, message_type, output_data, created_at")
          .eq("session_id", sid)
          .order("created_at", { ascending: true });

        let hasNew = false;
        for (const row of (data as TurnRow[] | null) || []) {
          if (!processedTurnIdsRef.current.has(row.id)) {
            if (processTurn(row, true)) hasNew = true;
          }
        }

        pollIntervalRef.current = hasNew
          ? POLL_MIN_MS
          : Math.min(Math.round(pollIntervalRef.current * 1.4), POLL_MAX_MS);
      } catch {
        pollIntervalRef.current = POLL_MAX_MS;
      }
      pollRef.current = setTimeout(tick, pollIntervalRef.current);
    };

    pollRef.current = setTimeout(tick, pollIntervalRef.current);
  }, [processTurn]);

  const subscribe = useCallback((sid: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`flow-builder-chat-${sid}`)
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "prometheus_build_turns",
          filter: `session_id=eq.${sid}`,
        },
        (payload: { new: TurnRow }) => {
          pollIntervalRef.current = POLL_MIN_MS;
          processTurn(payload.new, true);
        },
      )
      .subscribe();

    channelRef.current = channel;
    schedulePoll(sid);
  }, [processTurn, schedulePoll]);

  const resolveModelId = useCallback(async (): Promise<string> => {
    const { data } = await supabase
      .from("agent_flows")
      .select("flow_definition")
      .eq("id", flowId)
      .single();

    const briefing = (data?.flow_definition as { briefing?: { quality_model?: string } } | null)?.briefing;
    return briefing?.quality_model?.trim() || DEFAULT_MODEL;
  }, [flowId]);

  const ensureSession = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: existing } = await supabase
      .from("prometheus_build_sessions" as never)
      .select("id")
      .eq("target_flow_id", flowId)
      .eq("intent", "modify")
      .eq("user_id", user.id)
      .is("success", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return existing.id as string;
    }

    const modelId = await resolveModelId();
    const { data, error } = await supabase.functions.invoke("prometheus-builder", {
      body: {
        action: "start",
        intent: "modify",
        flow_id: flowId,
        model_id: modelId,
        briefing: { quality_model: modelId },
      },
    });

    if (error) throw error;
    return (data as { session_id?: string })?.session_id ?? null;
  }, [flowId, resolveModelId]);

  useEffect(() => {
    if (!enabled || !flowId) return;

    let cancelled = false;

    void (async () => {
      try {
        const sid = await ensureSession();
        if (cancelled || !sid) return;

        setSessionId(sid);
        processedTurnIdsRef.current.clear();
        setMessages([]);
        await hydrateTurns(sid);
        subscribe(sid);
        setInitialized(true);
      } catch (err) {
        console.error("[useFlowBuilderChat] init failed:", err);
        setInitialized(true);
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
  }, [enabled, flowId, ensureSession, hydrateTurns, subscribe]);

  const onSend = useCallback(async (text: string, _mode?: string, _parts?: StoredMessagePart[]) => {
    const trimmed = text.trim();
    if (!trimmed || running) return;

    let sid = sessionId;
    if (!sid) {
      sid = await ensureSession();
      if (!sid) return;
      setSessionId(sid);
      subscribe(sid);
    }

    setRunning(true);

    const { error } = await supabase.functions.invoke("prometheus-builder", {
      body: { action: "message", session_id: sid, message: trimmed },
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
    }
  }, [running, sessionId, ensureSession, subscribe]);

  const onStop = useCallback(async () => {
    if (!sessionId) {
      setRunning(false);
      return;
    }
    await supabase.functions.invoke("prometheus-builder", {
      body: { action: "halt", session_id: sessionId },
    });
    setRunning(false);
  }, [sessionId]);

  const setChatVisible = useCallback((visible: boolean) => {
    chatVisibleRef.current = visible;
    if (visible) setUnreadCount(0);
  }, []);

  const threadItems = messagesToThreadItems(messages, running);

  return {
    messages,
    threadItems,
    running,
    initialized,
    unreadCount,
    onSend,
    onStop,
    setChatVisible,
  };
}