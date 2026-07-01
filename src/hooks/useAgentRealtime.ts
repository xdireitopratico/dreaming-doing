// useAgentRealtime.ts — Canal único de Realtime unificado (FORGE 2.0).
// Substitui 5 listeners independentes por 1 canal com invalidação TanStack Query.
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AgentRealtimeEvent = {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
};

type OnEvent = (event: AgentRealtimeEvent) => void;

const MAX_REALTIME_RECONNECT = 3;

/** Hook único de Realtime — um canal que recebe todos os eventos do agente
 *  e invalida queries do TanStack Query automaticamente. */
export function useAgentRealtime(
  projectId: string,
  conversationId: string | null | undefined,
  onEvent?: OnEvent,
): void {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribeGenerationRef = useRef(0);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  useEffect(() => {
    const generation = ++subscribeGenerationRef.current;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const subscribe = () => {
      if (generation !== subscribeGenerationRef.current) return;

      channel = supabase.channel(`agent-v2-${projectId}`);
      channelRef.current = channel;

      // messages changes (assistant replies, plan proposals).
      // Filtra por role=assistant no server-side filter para não refetchar
      // a janela inteira a cada INSERT do user (que é otimista). Também evita
      // re-render do thread em tool_dones que não alteram messages.
      // Cobre Bug #9 (chat dança) e Bug #16 (badge "Na fila" não some).
      const messagesFilter = conversationId ? `conversation_id=eq.${conversationId}` : undefined;
      channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          ...(messagesFilter ? { filter: messagesFilter } : {}),
        },
        (payload: { new: Record<string, unknown>; old?: Record<string, unknown> | null }) => {
          const row = payload.new as Record<string, unknown>;
          // Só refetcha a janela quando um novo assistant chega — user messages
          // são otimistas e o cache já está em sync via mutation.
          if (row?.role === "assistant" && conversationId) {
            queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
          }
        },
      );

      // UPDATE em messages: cobre patch de meta.queued=false (drain da fila).
      channel.on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          ...(messagesFilter ? { filter: messagesFilter } : {}),
        },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> | null }) => {
          const row = payload.new as Record<string, unknown>;
          const old = payload.old as Record<string, unknown> | null;
          const newMeta = (row?.meta ?? {}) as Record<string, unknown>;
          const oldMeta = ((old?.meta ?? {}) as Record<string, unknown>) ?? {};
          // Dispara refetch quando o flag queued muda (Fila drena → bubble limpa).
          if (newMeta.queued !== oldMeta.queued && conversationId) {
            queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
          }
        },
      );

      channel.subscribe((status: string, err?: Error) => {
        if (generation !== subscribeGenerationRef.current) return;
        if (status === "SUBSCRIBED") {
          reconnectAttemptsRef.current = 0;
          return;
        }
        if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`[FORGE Realtime] agent-v2-${projectId} → ${status}`, err);
          if (reconnectAttemptsRef.current >= MAX_REALTIME_RECONNECT) return;
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(500 * 2 ** reconnectAttemptsRef.current, 8000);
          clearReconnectTimer();
          reconnectTimerRef.current = setTimeout(() => {
            if (generation !== subscribeGenerationRef.current) return;
            clearReconnectTimer();
            if (channel) {
              void supabase.removeChannel(channel);
            }
            channel = null;
            subscribe();
          }, delay);
        }
      });
    };

    subscribe();

    return () => {
      subscribeGenerationRef.current += 1;
      clearReconnectTimer();
      const currentChannel = channelRef.current;
      channelRef.current = null;
      if (currentChannel) {
        currentChannel.unsubscribe();
        void supabase.removeChannel(currentChannel);
      }
    };
  }, [projectId, conversationId, queryClient, onEvent]);
}
