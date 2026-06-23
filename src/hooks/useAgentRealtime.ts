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

/** Hook único de Realtime — um canal que recebe todos os eventos do agente
 *  e invalida queries do TanStack Query automaticamente. */
export function useAgentRealtime(
  projectId: string,
  conversationId: string | null | undefined,
  onEvent?: OnEvent,
): void {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  useEffect(() => {
    const channel = supabase.channel(`agent-v2-${projectId}`);

    // agent_runs updates (status, state, heartbeat)
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "agent_runs", filter: `project_id=eq.${projectId}` },
      (_payload: unknown) => {
        queryClient.invalidateQueries({ queryKey: ["agent-runs", projectId] });
      },
    );

    // agent_stream_events inserts (timeline, tool results, narration)
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "agent_stream_events" },
      (payload: { new: Record<string, unknown> }) => {
        const row = payload.new as Record<string, unknown>;

        if (onEvent) {
          onEvent({
            type: (row.event_type as string) ?? "unknown",
            data: (row.payload as Record<string, unknown>) ?? {},
            timestamp: Date.now(),
          });
        }

        // file_diff or preview_sync → invalidate preview
        const eventType = row.event_type as string;
        if (eventType === "file_diff" || eventType === "preview_sync") {
          queryClient.invalidateQueries({ queryKey: ["preview", projectId] });
        }

        // Terminal events → invalidate messages
        if (eventType === "done" || eventType === "finish" || eventType === "canceled") {
          if (conversationId) {
            queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
          }
          queryClient.invalidateQueries({ queryKey: ["agent-runs", projectId] });
        }
      },
    );

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
      if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        console.error(`[FORGE Realtime] agent-v2-${projectId} → ${status}`, err);
      }
    });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [projectId, conversationId, queryClient, onEvent]);
}
