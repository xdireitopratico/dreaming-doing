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
import type { PendingQueueItem } from "@/components/editor/PendingQueuePanel";

function formatQueueBlockReason(reason?: string): string | null {
  if (!reason) return null;
  if (reason.startsWith("blocking_run:")) {
    return "Agente ainda em execução — a fila processa quando liberar (ou após ~5 min sem atividade).";
  }
  if (reason === "inngest_failed") {
    return "Falha ao disparar o worker — verifique INNGEST_EVENT_KEY no servidor.";
  }
  if (reason === "lock_failed") {
    return "Não foi possível adquirir lock do agente — tente Processar de novo.";
  }
  if (reason === "taste_limit") {
    return "Limite Taste Chat atingido — configure API em /api.";
  }
  return reason;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled", "awaiting_user"]);
const STALE_STREAM_MS = 15 * 60 * 1000;
const STALE_STREAM_WITH_QUEUE_MS = 5 * 60 * 1000;

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

  useEffect(() => {
    pendingQueueCountRef.current = progress.pendingQueueCount ?? 0;
  }, [progress.pendingQueueCount]);

  const [connected, setConnected] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [frozenRuns, setFrozenRuns] = useState<Map<string, FrozenRunSnapshot>>(new Map());
  const [pendingQueueItems, setPendingQueueItems] = useState<PendingQueueItem[]>([]);
  const [queueBlockingReason, setQueueBlockingReason] = useState<string | null>(null);

  const runIdRef = useRef<string | null>(null);
  const pendingQueueCountRef = useRef(0);
  const lastSeqRef = useRef(0);
  const eventChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const statusChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stalePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    const terminal = t === "finish" || t === "canceled" || t === "error";
    const freezeTerminal = t === "finish" || t === "done" || t === "canceled" || t === "error";
    setProgress((prev) => {
      const next = applyAgentProgressEvent(prev, event);
      const rid = runIdRef.current;
      if (freezeTerminal && rid) {
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
    if (stalePollRef.current) {
      clearInterval(stalePollRef.current);
      stalePollRef.current = null;
    }
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
    (status: string, error: string | null, streamText?: string | null) => {
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
            lastFinishOk: p.lastFinishOk === false ? false : p.lastFinishOk ?? true,
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
        persistFrozen({
          ...next,
          streamText: streamText ?? next.streamText ?? next.summary ?? p.streamText,
        });
        return {
          ...next,
          streamText: streamText ?? next.streamText ?? next.summary ?? p.streamText,
        };
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
        .select("status, error, canceled_at, meta, heartbeat_at, started_at")
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

      if (run?.status === "running") {
        const lastRow = rows?.[rows.length - 1];
        const lastActivity =
          (lastRow?.created_at as string | undefined) ??
          (run.heartbeat_at as string | null) ??
          (run.started_at as string | null);
        const staleMs =
          pendingQueueCountRef.current > 0 ? STALE_STREAM_WITH_QUEUE_MS : STALE_STREAM_MS;
        const stale =
          lastActivity &&
          Date.now() - new Date(lastActivity).getTime() > staleMs;
        if (stale) {
          const meta = (run.meta ?? {}) as Record<string, unknown>;
          const resumable = meta.checkpoint === true || meta.resume === true;
          const error =
            (run.error as string | null) ??
            (resumable
              ? "Execução interrompida — use Continuar para retomar do checkpoint."
              : "Execução interrompida — envie outra mensagem para tentar de novo.");
          logEditorTelemetryEvent("agent_run", "stale_stream_detected", "warn", runId.slice(0, 8));
          const finishEvent = {
            type: "finish",
            data: { ok: false, resumable, error, stale: true },
            timestamp: Date.now(),
          };
          setProgress((p) => {
            const next = applyAgentProgressEvent(p, finishEvent);
            persistFrozen(next);
            return next;
          });
          teardownChannels();
          return true;
        }
      }

      return terminal;
    },
    [applyStreamRow, syncRunStatus, persistFrozen, teardownChannels],
  );

  const subscribeToRun = useCallback(
    async (runId: string, opts?: { resetProgress?: boolean }) => {
      teardownChannels();
      runIdRef.current = runId;
      setActiveRunId(runId);
      setQueueBlockingReason(null);
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
          async (payload) => {
            const row = payload.new as { status: string; error: string | null; canceled_at: string | null };
            if (!runIdRef.current) return;
            await catchUpRun(runIdRef.current);
            if (row.canceled_at || row.status === "canceled") {
              syncRunStatus("canceled", row.error);
            } else if (TERMINAL_STATUSES.has(row.status)) {
              syncRunStatus(row.status, row.error);
            }
          },
        )
        .subscribe();
      statusChannelRef.current = statusChannel;

      if (stalePollRef.current) clearInterval(stalePollRef.current);
      stalePollRef.current = setInterval(() => {
        if (!runIdRef.current) return;
        void catchUpRun(runIdRef.current);
      }, 12_000);
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

  const refreshPendingQueue = useCallback(
    async (projectId: string, conversationId: string) => {
      try {
        const res = await postAgentRun({
          action: "list_pending",
          projectId,
          conversationId,
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          pendingCount?: number;
          items?: PendingQueueItem[];
        };
        if (typeof body.pendingCount === "number") {
          setProgress((p) => ({ ...p, pendingQueueCount: body.pendingCount! }));
        }
        setPendingQueueItems(body.items ?? []);
        if ((body.pendingCount ?? 0) === 0) {
          setQueueBlockingReason(null);
        }
      } catch {
        // best-effort — contador atualiza no próximo mount/finish
      }
    },
    [postAgentRun],
  );

  const syncPendingCount = refreshPendingQueue;

  const clearPendingItem = useCallback(
    async (projectId: string, conversationId: string, messageId: string) => {
      const res = await postAgentRun({
        action: "clear_pending",
        projectId,
        conversationId,
        messageId,
      });
      if (!res.ok) return;
      await refreshPendingQueue(projectId, conversationId);
    },
    [postAgentRun, refreshPendingQueue],
  );

  const clearAllPending = useCallback(
    async (projectId: string, conversationId: string) => {
      const res = await postAgentRun({
        action: "clear_pending",
        projectId,
        conversationId,
      });
      if (!res.ok) return;
      setQueueBlockingReason(null);
      await refreshPendingQueue(projectId, conversationId);
    },
    [postAgentRun, refreshPendingQueue],
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
      setQueueBlockingReason(null);
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
        setQueueBlockingReason(formatQueueBlockReason(body.reason));
        if (body.runId) {
          setQueueBlockingReason(null);
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
          void refreshPendingQueue(projectId, conversationId);
          return { ok: true, pendingCount: body.pendingCount, message: body.message };
        }
        return { ok: false, message: "Agente livre — use run normal." };
      } catch (e) {
        return { ok: false, message: formatAgentFetchError(e) };
      }
    },
    [postAgentRun, refreshPendingQueue],
  );

  const stop = useCallback(async () => {
    const runId = runIdRef.current;

    let frozenSnap: AgentProgress | null = null;
    setProgress((p) => {
      frozenSnap = {
        ...p,
        finished: true,
        canceled: true,
        resumable: false,
        autoResuming: false,
        statusHint: "Cancelando…",
      };
      return frozenSnap;
    });
    if (frozenSnap) persistFrozen(frozenSnap);
    setConnected(false);

    if (runId) {
      try {
        await cancelAgentRun(runId);
        logEditorTelemetryEvent("agent", "cancel_request", "info", runId.slice(0, 8));
        setProgress((p) => {
          const next = {
            ...p,
            error: null,
            statusHint: "Cancelado pelo usuário",
            finished: true,
            canceled: true,
          };
          persistFrozen(next);
          return next;
        });
      } catch (e) {
        setProgress((p) => {
          const next = {
            ...p,
            error: formatAgentFetchError(e),
            statusHint: "Falha ao cancelar — tente novamente",
            finished: true,
            canceled: false,
            resumable: true,
          };
          persistFrozen(next);
          return next;
        });
      }
    }

    runIdRef.current = null;
    setActiveRunId(null);
    teardownChannels();
  }, [persistFrozen, teardownChannels]);

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
    // Mantém frozen no mapa — mini-cards Lovable persistem no thread após materializar no DB.
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
    refreshPendingQueue,
    pendingQueueItems,
    queueBlockingReason,
    clearPendingItem,
    clearAllPending,
    disconnect,
    stop,
    clearPendingPlan,
    hydratePendingPlan,
    acknowledgeMaterializedRun,
  };
}