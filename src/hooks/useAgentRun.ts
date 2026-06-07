/**
 * useAgentRun — Realtime-based hook for the new P0 architecture.
 *
 * P0 architecture: frontend calls agent-run (Edge Function) which sends an
 * Inngest event and returns runId in <1s. The frontend subscribes to Supabase
 * Realtime to receive events and status changes for the run.
 *
 * This hook is a parallel implementation to useSSE — the existing useSSE is
 * kept working for now (P2.5 will deprecate it; P3 will remove). The new
 * hook is the recommended path for new code.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import { loadAgentSessionExtensions } from "@/lib/agent-session-extensions";
import type { ForgeSessionKind, TasteAction } from "@/lib/taste";
import {
  formatAgentFetchError,
  formatAgentHttpError,
} from "@/lib/agent-fetch-errors";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { cancelAgentRun } from "@/lib/agent-cancel";

export type AgentRunEvent = {
  seq: number;
  runId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type AgentRunStatus = {
  id: string;
  status: "pending" | "running" | "awaiting_user" | "completed" | "failed" | "canceled";
  steps: number;
  error: string | null;
  meta: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
  canceledAt: string | null;
};

export type StartRunResponse = {
  ok: boolean;
  runId: string;
  mode: "plan" | "build";
  eventId: string | null;
  queued: boolean;
};

export type ConnectOptions = {
  resume?: boolean;
  mode: "plan" | "build";
};

export type UseAgentRunReturn = {
  runId: string | null;
  status: AgentRunStatus["status"] | null;
  events: AgentRunEvent[];
  finished: boolean;
  error: string | null;
  connected: boolean;
  start: (params: {
    projectId: string;
    conversationId: string;
    sessionKind: ForgeSessionKind | undefined;
    tasteAction: TasteAction | undefined;
    message: string;
    options?: ConnectOptions;
  }) => Promise<StartRunResponse | null>;
  watch: (runId: string) => void;
  cancel: (runId: string) => Promise<void>;
  reset: () => void;
};

export function useAgentRun(): UseAgentRunReturn {
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<AgentRunStatus["status"] | null>(null);
  const [events, setEvents] = useState<AgentRunEvent[]>([]);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const eventChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const statusChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const teardownChannels = useCallback(() => {
    if (eventChannelRef.current) {
      void supabase.removeChannel(eventChannelRef.current);
      eventChannelRef.current = null;
    }
    if (statusChannelRef.current) {
      void supabase.removeChannel(statusChannelRef.current);
      statusChannelRef.current = null;
    }
    setConnected(false);
  }, []);

  const subscribeToRun = useCallback(
    (id: string) => {
      teardownChannels();

      const eventChannel = supabase
        .channel(`agent-events-${id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "agent_stream_events", filter: `run_id=eq.${id}` },
          (payload) => {
            const row = payload.new as {
              seq: number;
              run_id: string;
              event_type: string;
              payload: Record<string, unknown>;
              created_at: string;
            };
            setEvents((prev) => [
              ...prev,
              {
                seq: row.seq,
                runId: row.run_id,
                eventType: row.event_type,
                payload: row.payload,
                createdAt: row.created_at,
              },
            ]);
            if (row.event_type === "finish" || row.event_type === "done") {
              setFinished(true);
            }
          },
        )
        .subscribe((s) => {
          if (s === "SUBSCRIBED") setConnected(true);
          else if (s === "CLOSED" || s === "CHANNEL_ERROR") setConnected(false);
        });
      eventChannelRef.current = eventChannel;

      const statusChannel = supabase
        .channel(`agent-status-${id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "agent_runs", filter: `id=eq.${id}` },
          (payload) => {
            const row = payload.new as { status: AgentRunStatus["status"]; error: string | null };
            setStatus(row.status);
            if (row.status === "completed" || row.status === "failed" || row.status === "canceled") {
              setFinished(true);
              if (row.error) setError(row.error);
            }
          },
        )
        .subscribe();
      statusChannelRef.current = statusChannel;
    },
    [teardownChannels],
  );

  useEffect(() => {
    return () => {
      teardownChannels();
    };
  }, [teardownChannels]);

  const start: UseAgentRunReturn["start"] = useCallback(
    async ({ projectId, conversationId, sessionKind, tasteAction, message, options }) => {
      const { url, publishableKey } = getSupabaseEnv();
      if (!url || !publishableKey) {
        setError("Supabase não configurado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.");
        setFinished(true);
        return null;
      }

      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        setError("Sessão expirada. Faça login novamente.");
        setFinished(true);
        return null;
      }

      const enabledSkillIds = loadAgentSessionExtensions().enabledSkillIds;
      const enabledMcpIds = loadAgentSessionExtensions().enabledMcpIds;

      setEvents([]);
      setFinished(false);
      setError(null);
      setStatus("pending");

      logEditorTelemetryEvent("agent_run", "start_request", "info", sessionKind ?? "auto");
      void options;

      try {
        const res = await fetch(`${url}/functions/v1/agent-run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: publishableKey,
          },
          body: JSON.stringify({
            projectId,
            conversationId,
            preferences: loadAgentPreferences(),
            sessionKind,
            tasteAction,
            message,
            enabledSkillIds,
            enabledMcpIds,
            mode: options?.mode ?? "build",
            resume: options?.resume ?? false,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          let errMsg: string;
          try {
            const body = JSON.parse(text) as { error?: string; code?: string };
            errMsg = formatAgentHttpError(body.error ?? text, body.code);
          } catch {
            errMsg = formatAgentHttpError(text);
          }
          setError(errMsg);
          setFinished(true);
          logEditorTelemetryEvent("agent_run", "start_failed", "error", sessionKind ?? "auto");
          return null;
        }

        const data = (await res.json()) as StartRunResponse;
        if (!data.ok || !data.runId) {
          setError("Resposta inválida do servidor");
          setFinished(true);
          return null;
        }

        setRunId(data.runId);
        subscribeToRun(data.runId);
        logEditorTelemetryEvent("agent_run", "start_ok", "info", sessionKind ?? "auto");
        return data;
      } catch (e) {
        setError(formatAgentFetchError(e));
        setFinished(true);
        logEditorTelemetryEvent("agent_run", "start_exception", "error", sessionKind ?? "auto");
        return null;
      }
    },
    [subscribeToRun],
  );

  const watch = useCallback(
    (id: string) => {
      setRunId(id);
      setEvents([]);
      setFinished(false);
      setError(null);
      subscribeToRun(id);
    },
    [subscribeToRun],
  );

  const cancel = useCallback(async (id: string) => {
    await cancelAgentRun(id);
    setStatus("canceled");
    setFinished(true);
  }, []);

  const reset = useCallback(() => {
    teardownChannels();
    setRunId(null);
    setStatus(null);
    setEvents([]);
    setFinished(false);
    setError(null);
    setConnected(false);
  }, [teardownChannels]);

  return { runId, status, events, finished, error, connected, start, watch, cancel, reset };
}
