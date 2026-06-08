/**
 * useAgentRun — Supabase Realtime for agent_stream_events + agent_runs (P0).
 *
 * Flow: POST agent-run → { runId } → subscribe postgres_changes.
 * One-time catch-up on subscribe; no polling.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import { loadAgentSessionExtensions } from "@/lib/agent-session-extensions";
import type { ForgeSessionKind, TasteAction } from "@/lib/taste";
import { formatAgentFetchError, formatAgentHttpError } from "@/lib/agent-fetch-errors";
import { releaseAgentConnect, tryAcquireAgentConnect } from "@/lib/agent-session-guards";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { cancelAgentRun } from "@/lib/agent-cancel";
import {
  applyAgentProgressEvent,
  initialAgentProgress,
  streamRowToSSEEvent,
  type AgentConnectOptions,
  type AgentProgress,
} from "@/lib/agent-progress";
import { freezeSnapshot, type FrozenRunSnapshot } from "@/lib/lovable-thread";

const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled", "awaiting_user"]);

async function parseErrorResponse(res: Response): Promise<string> {
  const txt = await res.text().catch(() => "");
  try {
    const body = JSON.parse(txt) as { error?: string; message?: string; code?: string };
    const raw = body.error ?? body.message ?? txt.slice(0, 280);
    return formatAgentHttpError(raw, body.code);
  } catch {
    return txt.slice(0, 280) || `HTTP ${res.status}`;
  }
}

export type { AgentProgress, AgentConnectOptions, PlanStep, PendingPlan } from "@/lib/agent-progress";

export function useAgentRun() {
  const [progress, setProgress] = useState<AgentProgress>(initialAgentProgress);
  const [connected, setConnected] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [frozenRuns, setFrozenRuns] = useState<Map<string, FrozenRunSnapshot>>(new Map());

  const runIdRef = useRef<string | null>(null);
  const lastSeqRef = useRef(0);
  const eventChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const statusChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const applyStreamRow = useCallback((row: {
    seq: number;
    event_type: string;
    payload: Record<string, unknown>;
    created_at?: string;
  }): boolean => {
    if (row.seq <= lastSeqRef.current) return false;
    lastSeqRef.current = row.seq;
    const event = streamRowToSSEEvent(row);
    const t = event.type;
    const terminal = t === "finish" || t === "done" || t === "canceled" || t === "error";
    setProgress((prev) => {
      const next = applyAgentProgressEvent(prev, event);
      const rid = runIdRef.current;
      if (terminal && rid) {
        const snap = freezeSnapshot({
          ...next,
          streamText: next.streamText ?? prev.streamText,
        });
        setFrozenRuns((m) => {
          const copy = new Map(m);
          copy.set(rid, snap);
          return copy;
        });
      }
      return next;
    });
    return terminal;
  }, []);

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

  const persistFrozen = useCallback((snap: AgentProgress) => {
    const rid = runIdRef.current;
    if (!rid) return;
    setFrozenRuns((m) => {
      const copy = new Map(m);
      copy.set(rid, freezeSnapshot(snap));
      return copy;
    });
  }, []);

  const syncRunStatus = useCallback(
    (status: string, error: string | null) => {
      setProgress((p) => {
        let next: AgentProgress;
        if (status === "awaiting_user") {
          next = { ...p, finished: true, awaiting: true, awaitingKind: "qualify", autoResuming: false };
        } else if (status === "canceled") {
          next = {
            ...p,
            finished: true,
            canceled: true,
            resumable: false,
            autoResuming: false,
            error: error ?? p.error,
          };
        } else if (status === "completed") {
          next = {
            ...p,
            finished: true,
            lastFinishOk: p.lastFinishOk ?? true,
            resumable: false,
            autoResuming: false,
          };
        } else if (status === "failed") {
          next = {
            ...p,
            finished: true,
            lastFinishOk: false,
            error: error ?? p.error ?? "Agente falhou",
            resumable: false,
            autoResuming: false,
          };
        } else {
          return p;
        }
        persistFrozen({ ...next, streamText: next.streamText ?? p.streamText });
        return next;
      });
      teardownChannels();
    },
    [persistFrozen, teardownChannels],
  );

  const catchUpRun = useCallback(
    async (runId: string): Promise<boolean> => {
      const { data: rows, error } = await supabase
        .from("agent_stream_events")
        .select("seq, event_type, payload, created_at")
        .eq("run_id", runId)
        .gt("seq", lastSeqRef.current)
        .order("seq", { ascending: true });

      if (error) {
        logEditorTelemetryEvent("agent_run", "catchup_error", "warn", error.message.slice(0, 120));
      }

      let terminal = false;
      for (const row of rows ?? []) {
        if (applyStreamRow({
          seq: row.seq as number,
          event_type: row.event_type as string,
          payload: (row.payload ?? {}) as Record<string, unknown>,
          created_at: row.created_at as string | undefined,
        })) {
          terminal = true;
        }
      }

      const { data: run } = await supabase
        .from("agent_runs")
        .select("status, error, canceled_at")
        .eq("id", runId)
        .maybeSingle();

      if (run?.canceled_at || run?.status === "canceled") {
        syncRunStatus("canceled", run.error);
        return true;
      }
      if (run?.status && TERMINAL_STATUSES.has(run.status)) {
        syncRunStatus(run.status, run.error);
        return true;
      }

      return terminal;
    },
    [applyStreamRow, syncRunStatus],
  );

  const subscribeToRun = useCallback(
    async (runId: string, opts?: { resetProgress?: boolean }) => {
      teardownChannels();
      runIdRef.current = runId;
      setActiveRunId(runId);
      if (opts?.resetProgress !== false) {
        lastSeqRef.current = 0;
        setProgress({
          ...initialAgentProgress,
          statusHint: "Conectando ao agente…",
        });
      }

      setConnected(true);

      const terminal = await catchUpRun(runId);
      if (terminal) return;

      const eventChannel = supabase
        .channel(`agent-events-${runId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "agent_stream_events", filter: `run_id=eq.${runId}` },
          (payload) => {
            const row = payload.new as {
              seq: number;
              event_type: string;
              payload: Record<string, unknown>;
              created_at?: string;
            };
            if (applyStreamRow(row)) {
              teardownChannels();
            }
          },
        )
        .subscribe();
      eventChannelRef.current = eventChannel;

      const statusChannel = supabase
        .channel(`agent-status-${runId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "agent_runs", filter: `id=eq.${runId}` },
          (payload) => {
            const row = payload.new as { status: string; error: string | null; canceled_at: string | null };
            if (row.canceled_at || row.status === "canceled") {
              syncRunStatus("canceled", row.error);
            } else if (TERMINAL_STATUSES.has(row.status)) {
              syncRunStatus(row.status, row.error);
            }
          },
        )
        .subscribe();
      statusChannelRef.current = statusChannel;
    },
    [applyStreamRow, catchUpRun, syncRunStatus, teardownChannels],
  );

  useEffect(() => {
    return () => {
      teardownChannels();
    };
  }, [teardownChannels]);

  const postAgentRun = useCallback(
    async (body: Record<string, unknown>): Promise<Response> => {
      const { url, publishableKey } = getSupabaseEnv();
      if (!url || !publishableKey) {
        throw new Error(
          "Supabase não configurado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.",
        );
      }
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }

      return fetch(`${url}/functions/v1/agent-run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: publishableKey,
        },
        body: JSON.stringify(body),
      });
    },
    [],
  );

  const syncPendingCount = useCallback(
    async (projectId: string, conversationId: string) => {
      try {
        const res = await postAgentRun({
          action: "pending_count",
          projectId,
          conversationId,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { pendingCount?: number };
        if (typeof body.pendingCount === "number") {
          setProgress((p) => ({ ...p, pendingQueueCount: body.pendingCount! }));
        }
      } catch {
        // best-effort — contador atualiza no próximo mount/finish
      }
    },
    [postAgentRun],
  );

  const connect = useCallback(
    async (
      projectId: string,
      conversationId: string,
      sessionKind?: ForgeSessionKind,
      options?: AgentConnectOptions & { tasteAction?: TasteAction },
    ) => {
      if (!tryAcquireAgentConnect()) {
        logEditorTelemetryEvent("agent_run", "connect_skipped_inflight", "warn");
        return;
      }
      const manualResume = options?.resume === true;
      teardownChannels();
      setProgress({
        ...initialAgentProgress,
        statusHint: manualResume ? "Conectando para retomar o agente…" : "Iniciando agente…",
        resumable: false,
        autoResuming: false,
      });

      logEditorTelemetryEvent("agent_run", "connect_start", "info", sessionKind ?? "auto");

      try {
        const res = await postAgentRun({
          projectId,
          conversationId,
          preferences: loadAgentPreferences(),
          sessionKind,
          ...(sessionKind === "taste" && options?.tasteAction ? { tasteAction: options.tasteAction } : {}),
          resume: manualResume,
          autoResume: false,
          mode: options?.mode ?? "build",
          ...loadAgentSessionExtensions(),
        });

        if (!res.ok) {
          const msg = await parseErrorResponse(res);
          setProgress((p) => ({ ...p, error: msg, finished: true }));
          releaseAgentConnect();
          return;
        }

        const body = (await res.json()) as {
          ok?: boolean;
          runId?: string;
          queued?: boolean;
          busy?: boolean;
          pendingCount?: number;
          message?: string;
          content?: string;
        };

        if (body.busy) {
          setProgress((p) => ({
            ...p,
            finished: true,
            pendingQueueCount: body.pendingCount ?? p.pendingQueueCount,
            statusHint: body.message ?? "Agente ocupado.",
            error: null,
          }));
          releaseAgentConnect();
          return;
        }

        if (body.queued) {
          setProgress((p) => ({
            ...p,
            finished: true,
            pendingQueueCount: body.pendingCount ?? 0,
            statusHint: body.message ?? "Mensagem na fila do agente.",
            error: null,
          }));
          releaseAgentConnect();
          return;
        }

        // Taste Chat concierge — JSON inline, sem runId (mensagem já salva no DB).
        if (body.ok && body.content && !body.runId) {
          setProgress((p) => ({
            ...p,
            finished: true,
            lastFinishOk: true,
            streamText: body.content ?? null,
            statusHint: "Resposta Taste enviada.",
          }));
          releaseAgentConnect();
          return;
        }

        if (!body.runId) {
          setProgress((p) => ({ ...p, error: "Resposta inválida do servidor", finished: true }));
          releaseAgentConnect();
          return;
        }

        await subscribeToRun(body.runId);
        logEditorTelemetryEvent("agent_run", "connect_ok", "info", body.runId.slice(0, 8));
      } catch (e) {
        teardownChannels();
        setProgress((p) => ({
          ...p,
          error: formatAgentFetchError(e),
          finished: true,
        }));
      } finally {
        releaseAgentConnect();
      }
    },
    [postAgentRun, subscribeToRun, teardownChannels],
  );

  const drainQueue = useCallback(
    async (
      projectId: string,
      conversationId: string,
      mode?: "plan" | "build" | "chat",
    ): Promise<{ ok: boolean; runId?: string; pendingCount?: number; reason?: string }> => {
      try {
        const res = await postAgentRun({
          action: "drain_queue",
          projectId,
          conversationId,
          mode: mode ?? "build",
        });
        if (!res.ok) {
          const msg = await parseErrorResponse(res);
          return { ok: false, reason: msg };
        }
        const body = (await res.json()) as {
          ok?: boolean;
          runId?: string;
          continued?: boolean;
          pendingCount?: number;
          reason?: string;
        };
        if (typeof body.pendingCount === "number") {
          setProgress((p) => ({ ...p, pendingQueueCount: body.pendingCount! }));
        }
        if (body.runId) {
          await subscribeToRun(body.runId);
          logEditorTelemetryEvent("agent_run", "drain_ok", "info", body.runId.slice(0, 8));
          return { ok: true, runId: body.runId, pendingCount: body.pendingCount };
        }
        return {
          ok: body.continued === true,
          pendingCount: body.pendingCount,
          reason: body.reason,
        };
      } catch (e) {
        return { ok: false, reason: formatAgentFetchError(e) };
      }
    },
    [postAgentRun, subscribeToRun],
  );

  const watch = useCallback(
    async (projectId: string, conversationId: string, runId: string) => {
      void projectId;
      void conversationId;
      const isNew = runIdRef.current !== runId;
      if (isNew) {
        runIdRef.current = runId;
        setActiveRunId(runId);
        setProgress({
          ...initialAgentProgress,
          statusHint: "Conectando ao agente…",
        });
      }
      await subscribeToRun(runId, { resetProgress: isNew });
    },
    [subscribeToRun],
  );

  const queueMessage = useCallback(
    async (
      projectId: string,
      conversationId: string,
      sessionKind?: ForgeSessionKind,
      tasteAction?: TasteAction,
    ): Promise<{ ok: boolean; pendingCount?: number; message?: string }> => {
      try {
        const res = await postAgentRun({
          projectId,
          conversationId,
          preferences: loadAgentPreferences(),
          sessionKind,
          enqueue: true,
          ...(sessionKind === "taste" && tasteAction ? { tasteAction } : {}),
          ...loadAgentSessionExtensions(),
        });

        if (!res.ok) {
          const msg = await parseErrorResponse(res);
          return { ok: false, message: msg };
        }

        const body = (await res.json()) as {
          queued?: boolean;
          pendingCount?: number;
          message?: string;
        };
        if (body.queued) {
          setProgress((p) => ({
            ...p,
            pendingQueueCount: body.pendingCount ?? 0,
            statusHint: body.message ?? "Mensagem na fila do agente.",
          }));
          return { ok: true, pendingCount: body.pendingCount, message: body.message };
        }
        return { ok: false, message: "Agente livre — use run normal." };
      } catch (e) {
        return { ok: false, message: formatAgentFetchError(e) };
      }
    },
    [postAgentRun],
  );

  const stop = useCallback(async () => {
    const runId = runIdRef.current;

    setProgress((p) => ({
      ...p,
      finished: true,
      canceled: true,
      resumable: false,
      autoResuming: false,
      statusHint: "Cancelando…",
    }));
    setConnected(false);

    if (runId) {
      try {
        await cancelAgentRun(runId);
        logEditorTelemetryEvent("agent", "cancel_request", "info", runId.slice(0, 8));
        setProgress((p) => ({
          ...p,
          error: null,
          statusHint: "Cancelado pelo usuário",
        }));
      } catch (e) {
        setProgress((p) => ({
          ...p,
          error: formatAgentFetchError(e),
          statusHint: "Falha ao cancelar — tente novamente",
          finished: true,
          canceled: false,
          resumable: true,
        }));
      }
    }

    runIdRef.current = null;
    setActiveRunId(null);
    teardownChannels();
  }, [teardownChannels]);

  const disconnect = useCallback(() => {
    runIdRef.current = null;
    setActiveRunId(null);
    teardownChannels();
    setProgress((p) => ({ ...p, finished: true }));
  }, [teardownChannels]);

  const replay = useCallback(
    async (projectId: string, conversationId: string, runId: string) => {
      void projectId;
      void conversationId;
      teardownChannels();
      setProgress({
        ...initialAgentProgress,
        statusHint: `Replaying run ${runId.slice(0, 8)}…`,
      });
      runIdRef.current = runId;
      lastSeqRef.current = 0;

      try {
        const { data, error } = await supabase
          .from("agent_stream_events")
          .select("seq, event_type, payload, created_at")
          .eq("run_id", runId)
          .order("seq", { ascending: true });

        if (error) {
          setProgress((p) => ({ ...p, error: error.message, finished: true }));
          return;
        }

        let next = initialAgentProgress;
        for (const row of data ?? []) {
          const event = streamRowToSSEEvent({
            event_type: row.event_type as string,
            payload: (row.payload ?? {}) as Record<string, unknown>,
            created_at: row.created_at as string | undefined,
            seq: row.seq as number,
          });
          next = applyAgentProgressEvent(next, event);
          lastSeqRef.current = row.seq as number;
        }
        setProgress(next);
      } finally {
        setConnected(false);
      }
    },
    [teardownChannels],
  );

  const clearPendingPlan = useCallback(() => {
    setProgress((p) => ({ ...p, pendingPlan: null, awaiting: false, awaitingKind: null }));
  }, []);

  const hydratePendingPlan = useCallback((plan: import("@/lib/agent-progress").PendingPlan) => {
    setProgress((p) => ({
      ...p,
      pendingPlan: plan,
      awaiting: true,
      awaitingKind: "plan_approval",
      statusHint: "Plano aguardando aprovação…",
    }));
  }, []);

  const acknowledgeMaterializedRun = useCallback((runId: string) => {
    setFrozenRuns((m) => {
      if (!m.has(runId)) return m;
      const copy = new Map(m);
      copy.delete(runId);
      return copy;
    });
    setActiveRunId((cur) => {
      if (cur === runId) {
        runIdRef.current = null;
        return null;
      }
      return cur;
    });
  }, []);

  return {
    progress,
    connected,
    activeRunId,
    frozenRuns,
    connect,
    watch,
    replay,
    queueMessage,
    drainQueue,
    syncPendingCount,
    disconnect,
    stop,
    clearPendingPlan,
    hydratePendingPlan,
    acknowledgeMaterializedRun,
  };
}