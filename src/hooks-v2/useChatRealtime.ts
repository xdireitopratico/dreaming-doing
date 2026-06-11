import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ChatState } from "@/lib-v2/chat-types";

type ChatRealtimeCallbacks = {
  onStreamText: (text: string | null) => void;
  onFinished: () => void;
  onError: (error: string) => void;
};

/**
 * 1 canal Realtime que cobre: agent_stream_events + agent_runs + messages.
 * Substitui os 5 canais antigos.
 */
export function useChatRealtime(
  projectId: string,
  conversationId: string | null | undefined,
  runId: string | null,
  chatState: ChatState,
  callbacks: ChatRealtimeCallbacks,
): void {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const chatStateRef = useRef(chatState);
  chatStateRef.current = chatState;

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase.channel(`chat-${projectId}`);

    if (runId) {
      channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_stream_events",
          filter: `run_id=eq.${runId}`,
        },
        (payload) => {
          const row = payload.new as { event_type?: string; payload?: Record<string, unknown> };
          const eventType = row.event_type ?? "";
          const data = row.payload ?? {};

          if (eventType === "assistant_text") {
            const chunk = (data.text as string) ?? "";
            const append = data.append === true || data.delta === true;
            const narration = data.narration === true;
            const thinking = data.thinking === true;
            if (!narration && !thinking) {
              const prev = chatStateRef.current.streamText;
              const next = append ? (prev ?? "") + chunk : chunk;
              callbacksRef.current.onStreamText(next);
            }
          }

          if (eventType === "start") {
            callbacksRef.current.onStreamText(chatStateRef.current.streamText);
          }

          if (eventType === "finish" || eventType === "done" || eventType === "canceled") {
            queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
            callbacksRef.current.onFinished();
          }

          if (eventType === "error") {
            const msg = (data.message as string) ?? "Erro desconhecido";
            callbacksRef.current.onError(msg);
          }
        },
      );

      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_runs", filter: `id=eq.${runId}` },
        (payload) => {
          const row = payload.new as { status?: string; error?: string };
          if (row.status === "completed" || row.status === "failed" || row.status === "canceled") {
            queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
            if (row.status === "failed") {
              callbacksRef.current.onError(row.error ?? "Run falhou");
            } else {
              callbacksRef.current.onFinished();
            }
          }
        },
      );
    }

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => {
        queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      },
    );

    channel.subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[Chat Realtime] chat-${projectId} → ${status}`, err);
      }
    });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, conversationId, runId, queryClient]);
}
