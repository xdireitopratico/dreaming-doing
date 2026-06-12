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
  type AgentConnectOptions,
  type AgentProgress,
  applyAgentProgressEvent,
  awaitingKindFromRunMeta,
  initialAgentProgress,
  streamRowToSSEEvent,
} from "@/lib/agent-progress";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";
import { hasFirstInspectorToken } from "@/lib/forge-run";
import { shouldRetainLiveRunSlot } from "@/lib/live-run-overlay";
import { isAssistantRunMaterialized } from "@/lib/assistant-materialized";
import { inspectorProgressWeight } from "@/lib/assistant-run-progress";
import type { ChatMessage } from "@/lib/chat-types";
import type { AgentBusyInfo } from "@/lib/agent-busy";
import { parseAgentBusyResponse } from "@/lib/agent-busy";

import type { PendingQueueItem } from "@/components/editor/PendingQueuePanel";

function withFrozenLatencyThought(next: AgentProgress, startedAtMs: number | null): AgentProgress {
  if (next.latencyThoughtMs != null || !startedAtMs) return next;
  if (!hasFirstInspectorToken(next)) return next;
  return {
    ...next,
    latencyThoughtMs: Math.max(500, Date.now() - startedAtMs),
  };
}

export type AgentConnectResult =
  | { ok: true }
  | { ok: false; error: string; busy?: AgentBusyInfo };

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
// Longer/conditional stale thresholds when Inngest is authoritative (PR1 dispatch foundation; avoids
// synthesizing stale finish on still-running Inngest step with ~4.5m budget + gaps between events/heartbeats).
const STALE_STREAM_MS = 30 * 60 * 1000;
const STALE_STREAM_WITH_QUEUE_MS = 10 * 60 * 1000;

const SESSION_STORAGE_KEY = "forge:agent-snapshot";
const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000;

function saveAgentSnapshot(snapshot: {
  projectId: string;
  conversationId: string;
  activeRunId: string | null;
  lastSeq: number;
  progress: AgentProgress;
}) {
  try {
    const payload = JSON.stringify({ ...snapshot, timestamp: Date.now() });
    sessionStorage.setItem(SESSION_STORAGE_KEY, payload);
  } catch {
    // ignore quota exceeded
  }
}

function loadAgentSnapshot(): {
  projectId?: string;
  conversationId?: string;
  activeRunId: string | null;
  lastSeq: number;
  progress: AgentProgress;
  timestamp: number;
} | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReturnType<typeof loadAgentSnapshot>;
    if (!parsed || typeof parsed.timestamp !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearAgentSnapshot() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

async function parseErrorResponse(res: Response): Promise<string> {
  const txt = await res.text().catch(() => "");
  try {
    const body = JSON.parse(txt) as {
      error?: string;
      message?: string;
      code?: string;
    };
    const raw = body.error ?? body.message ?? txt.slice(0, 280);
    return formatAgentHttpError(raw, body.code);
  } catch {
    return txt.slice(0, 280) || `HTTP ${res.status}`;
  }
}

export type {
  AgentConnectOptions,
  AgentProgress,
  PendingPlan,
  PlanStep,
} from "@/lib/agent-progress";

export function useAgentRun() {
  const [progress, setProgress] = useState<AgentProgress>(initialAgentProgress);
  const [connected, setConnected] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [pendingQueueItems, setPendingQueueItems] = useState<PendingQueueItem[]>([]);
  const [queueBlockingReason, setQueueBlockingReason] = useState<string | null>(null);
  /** Início do turno (envio) — persiste até o run terminar; alimenta Think latency no chat e inspector. */
  const [activeRunStartedAtMs, setActiveRunStartedAtMs] = useState<number | null>(null);
  /** Bump quando frozen map muda — refs não re-renderizam o inspector. */
  const [frozenProgressTick, setFrozenProgressTick] = useState(0);

  const runIdRef = useRef<string | null>(null);
  const activeRunStartedAtMsRef = useRef<number | null>(null);
  const pendingQueueCountRef = useRef(0);
  const progressRef = useRef<AgentProgress>(initialAgentProgress);
  const frozenRunProgressRef = useRef<Map<string, AgentProgress>>(new Map());
  const lastSeqRef = useRef(0);

  useEffect(() => {
    pendingQueueCountRef.current = progress.pendingQueueCount ?? 0;
  }, [progress.pendingQueueCount]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    activeRunStartedAtMsRef.current = activeRunStartedAtMs;
  }, [activeRunStartedAtMs]);

  const bumpFrozenProgressTick = useCallback(() => {
    setFrozenProgressTick((n) => n + 1);
  }, []);

  const freezeRunProgress = useCallback(
    (runId: string) => {
      if (!runId) return;
      if (runIdRef.current !== runId) return;
      const p = progressRef.current;
      if (inspectorProgressWeight(p) === 0) return;
      frozenRunProgressRef.current.set(runId, {
        ...p,
        timeline: [...(p.timeline ?? [])],
        tools: [...(p.tools ?? [])],
        diffs: [...(p.diffs ?? [])],
        deliveryFiles: [...(p.deliveryFiles ?? [])],
        buildLogLines: [...(p.buildLogLines ?? [])],
      });
      bumpFrozenProgressTick();
    },
    [bumpFrozenProgressTick],
  );

  const getFrozenRunProgress = useCallback((runId: string): AgentProgress | null => {
    return frozenRunProgressRef.current.get(runId) ?? null;
  }, []);

  const clearFrozenRunProgress = useCallback(
    (runId: string) => {
      if (!frozenRunProgressRef.current.delete(runId)) return;
      bumpFrozenProgressTick();
    },
    [bumpFrozenProgressTick],
  );

  const releaseLiveRunSlot = useCallback(
    (runId: string) => {
      freezeRunProgress(runId);
      runIdRef.current = null;
      setActiveRunId(null);
      setActiveRunStartedAtMs(null);
    },
    [freezeRunProgress],
  );
  const sessionContextRef = useRef<{ projectId: string; conversationId: string } | null>(null);
  const eventChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const statusChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stalePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Libera slot live só quando não há conteúdo a mostrar até o DB materializar.
  useEffect(() => {
    if (!progress.finished) return;
    if (!runIdRef.current && !activeRunId) return;
    if (activeRunStartedAtMsRef.current != null) return;
    if (shouldRetainLiveRunSlot(progress)) return;
    const rid = runIdRef.current ?? activeRunId;
    if (rid) releaseLiveRunSlot(rid);
    setConnected(false);
  }, [
    progress.finished,
    progress.awaiting,
    progress.awaitingKind,
    progress.canceled,
    activeRunId,
    progress,
    releaseLiveRunSlot,
  ]);

  // ─── Persistência de estado em sessionStorage (escopado por projeto+conversa) ─
  const saveSnapshot = useCallback(() => {
    const ctx = sessionContextRef.current;
    if (!ctx) return;
    saveAgentSnapshot({
      projectId: ctx.projectId,
      conversationId: ctx.conversationId,
      activeRunId: runIdRef.current,
      lastSeq: lastSeqRef.current,
      progress,
    });
  }, [progress]);

  // Salva snapshot debounced — lastSeqRef é síncrono em applyStreamRow
  useEffect(() => {
    const timer = setTimeout(saveSnapshot, 200);
    return () => clearTimeout(timer);
  }, [progress, saveSnapshot]);

  const applyStreamRow = useCallback(
    (row: {
      seq: number;
      event_type: string;
      payload: Record<string, unknown>;
      created_at?: string;
    }): boolean => {
      const event = streamRowToSSEEvent(row);
      const t = event.type;
      // Process "start" even out-of-seq on fresh subscribe (rapid successive runs; catchup may set seq
      // but late realtime "start" for the new runId must still initialize progress flags).
      const isFreshForStart = t === "start" && lastSeqRef.current === 0;
      if (row.seq <= lastSeqRef.current && !isFreshForStart) return false;
      lastSeqRef.current = row.seq;
      const terminal = t === "finish" || t === "canceled" || t === "error" || t === "done";
      setProgress((prev) => {
        let next = applyAgentProgressEvent(prev, event);
        next = withFrozenLatencyThought(next, activeRunStartedAtMsRef.current);
        return next;
      });
      if (terminal) {
        setActiveRunStartedAtMs(null);
      }
      return terminal;
    },
    [],
  );

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

  const syncRunStatus = useCallback(
    (
      status: string,
      error: string | null,
      streamText?: string | null,
      runMeta?: Record<string, unknown> | null,
    ) => {
      setProgress((p) => {
        let next: AgentProgress;
        if (status === "awaiting_user") {
          const fromMeta = awaitingKindFromRunMeta(runMeta);
          const planPending =
            fromMeta === "plan_approval" ||
            p.awaitingKind === "plan_approval" ||
            (p.pendingPlan?.steps?.length ?? 0) > 0;
          next = {
            ...p,
            finished: true,
            awaiting: true,
            awaitingKind: fromMeta ?? (planPending ? "plan_approval" : "clarify"),
            autoResuming: false,
          };
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
            lastFinishOk: p.lastFinishOk === false ? false : (p.lastFinishOk ?? true),
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
        const merged = {
          ...next,
          streamText: streamText ?? next.streamText ?? next.summary ?? p.streamText,
        };
        return withFrozenLatencyThought(merged, activeRunStartedAtMsRef.current);
      });
      setActiveRunStartedAtMs(null);
      teardownChannels();
      setConnected(false);
      setProgress((p) => {
        if (!shouldRetainLiveRunSlot(p) && runIdRef.current) {
          releaseLiveRunSlot(runIdRef.current);
          if (status !== "awaiting_user") {
            clearAgentSnapshot();
          }
        }
        return p;
      });
    },
    [teardownChannels, releaseLiveRunSlot],
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
        if (
          applyStreamRow({
            seq: row.seq as number,
            event_type: row.event_type as string,
            payload: (row.payload ?? {}) as Record<string, unknown>,
            created_at: row.created_at as string | undefined,
          })
        ) {
          terminal = true;
        }
      }

      const { data: run } = await supabase
        .from("agent_runs")
        .select("status, error, canceled_at, meta, heartbeat_at, started_at")
        .eq("id", runId)
        .maybeSingle();

      const runMeta = (run?.meta ?? null) as Record<string, unknown> | null;

      if (run?.canceled_at || run?.status === "canceled") {
        syncRunStatus("canceled", run.error, undefined, runMeta);
        return true;
      }
      if (run?.status && TERMINAL_STATUSES.has(run.status)) {
        syncRunStatus(run.status, run.error, undefined, runMeta);
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
        const stale = lastActivity && Date.now() - new Date(lastActivity).getTime() > staleMs;
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
          setProgress((p) => applyAgentProgressEvent(p, finishEvent));
          teardownChannels();
          setConnected(false);
          setProgress((p) => {
            if (!shouldRetainLiveRunSlot(p) && runIdRef.current === runId) {
              releaseLiveRunSlot(runId);
            }
            return p;
          });
          return true;
        }
      }

      return terminal;
    },
    [applyStreamRow, syncRunStatus, teardownChannels, releaseLiveRunSlot],
  );

  const subscribeToRun = useCallback(
    async (runId: string, opts?: { resetProgress?: boolean }) => {
      const isSame = runIdRef.current === runId;
      if (isSame && eventChannelRef.current) {
        // Idempotent channels per runId for rapid successive runs (no teardown/reset on re-sub for same;
        // avoids losing events or resetting seq on coordinator/orchestration re-watch).
        setConnected(true);
        setQueueBlockingReason(null);
        return;
      }
      if (!isSame) {
        teardownChannels();
      }
      runIdRef.current = runId;
      setActiveRunId(runId);
      setQueueBlockingReason(null);
      if (!isSame && opts?.resetProgress !== false) {
        lastSeqRef.current = 0;
        setProgress({
          ...initialAgentProgress,
          statusHint: "Conectando ao agente…",
        });
      } else if (!isSame) {
        lastSeqRef.current = 0;
      }

      setConnected(true);

      const terminal = await catchUpRun(runId);
      if (terminal) return;

      const eventChannel = supabase
        .channel(`agent-events-${runId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "agent_stream_events",
            filter: `run_id=eq.${runId}`,
          },
          (payload) => {
            if (runIdRef.current !== runId) return; // stale callback from prior subscription's channel (rapid run switch/terminal-while-second); closed-over runId is per-listener subscribe value. Prevents old listener apply/teardown stomping current run's live state or refs.
            const row = payload.new as {
              seq: number;
              event_type: string;
              payload: Record<string, unknown>;
              created_at?: string;
            };
            if (applyStreamRow(row)) {
              teardownChannels();
              setConnected(false);
              setProgress((p) => {
                if (!shouldRetainLiveRunSlot(p) && runIdRef.current === runId) {
                  releaseLiveRunSlot(runId);
                }
                return p;
              });
            }
          },
        )
        .subscribe();
      eventChannelRef.current = eventChannel;

      const statusChannel = supabase
        .channel(`agent-status-${runId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "agent_runs",
            filter: `id=eq.${runId}`,
          },
          async (payload) => {
            if (runIdRef.current !== runId) return; // stale callback from prior subscription's channel (rapid successive runs, terminal on first while second running); closed-over runId per this listener. Prevents cross-run catchUp (on live ref) or sync of old row's terminal status (which would stomp progress for new runId).
            const row = payload.new as {
              status: string;
              error: string | null;
              canceled_at: string | null;
              meta?: Record<string, unknown> | null;
            };
            if (!runIdRef.current) return;
            await catchUpRun(runIdRef.current);
            const runMeta = (row.meta ?? null) as Record<string, unknown> | null;
            if (row.canceled_at || row.status === "canceled") {
              syncRunStatus("canceled", row.error, undefined, runMeta);
            } else if (TERMINAL_STATUSES.has(row.status)) {
              syncRunStatus(row.status, row.error, undefined, runMeta);
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
    [applyStreamRow, catchUpRun, syncRunStatus, teardownChannels, releaseLiveRunSlot],
  );

  useEffect(() => {
    return () => {
      teardownChannels();
    };
  }, [teardownChannels]);

  const postAgentRun = useCallback(async (body: Record<string, unknown>): Promise<Response> => {
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
  }, []);

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
    ): Promise<AgentConnectResult> => {
      if (!tryAcquireAgentConnect()) {
        logEditorTelemetryEvent("agent_run", "connect_skipped_inflight", "warn");
        setProgress((p) => ({
          ...p,
          statusHint: "Aguarde — conexão do agente em andamento…",
        }));
        return {
          ok: false,
          error: "Aguarde — conexão do agente em andamento…",
        };
      }
      const manualResume = options?.resume === true;
      teardownChannels();
      setQueueBlockingReason(null);
      const keepPending = activeRunStartedAtMs != null;
      if (keepPending) {
        setProgress((p) => ({
          ...p,
          statusHint: "Conectando ao agente…",
          finished: false,
          resumable: false,
          autoResuming: false,
          phase: p.phase ?? null,
        }));
      } else {
        setProgress({
          ...initialAgentProgress,
          statusHint: manualResume ? "Conectando para retomar o agente…" : "Iniciando agente…",
          resumable: false,
          autoResuming: false,
          phase: null,
        });
      }

      logEditorTelemetryEvent("agent_run", "connect_start", "info", sessionKind ?? "auto");

      try {
        const res = await postAgentRun({
          projectId,
          conversationId,
          preferences: loadAgentPreferences(),
          sessionKind,
          ...(sessionKind === "taste" && options?.tasteAction
            ? { tasteAction: options.tasteAction }
            : {}),
          resume: manualResume,
          autoResume: false,
          mode: options?.mode ?? "build",
          ...loadAgentSessionExtensions(),
        });

        if (!res.ok) {
          const msg = await parseErrorResponse(res);
          setActiveRunStartedAtMs(null);
          setActiveRunId((cur) => (cur === PENDING_RUN_ID ? null : cur));
          setProgress((p) => ({ ...p, error: msg, finished: true }));
          releaseAgentConnect();
          return { ok: false, error: msg };
        }

        const body = (await res.json()) as Record<string, unknown>;

        const busyInfo = parseAgentBusyResponse(body);
        if (busyInfo) {
          const msg = busyInfo.message ?? "Agente ocupado.";
          setProgress((p) => ({
            ...p,
            finished: true,
            pendingQueueCount:
              typeof body.pendingCount === "number" ? body.pendingCount : p.pendingQueueCount,
            statusHint: msg,
            error: null,
          }));
          releaseAgentConnect();
          return { ok: false, error: msg, busy: busyInfo };
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
          return { ok: true };
        }

        // Taste Chat concierge — JSON inline, sem runId (mensagem já salva no DB).
        if (body.ok && body.content && !body.runId) {
          runIdRef.current = null;
          setActiveRunId(null);
          setActiveRunStartedAtMs(null);
          setProgress((p) => ({
            ...p,
            finished: true,
            lastFinishOk: true,
            streamText: body.content ?? null,
            statusHint: "Resposta Taste enviada.",
          }));
          releaseAgentConnect();
          return { ok: true };
        }

        if (!body.runId) {
          const msg = "Resposta inválida do servidor";
          setProgress((p) => ({
            ...p,
            error: msg,
            finished: true,
          }));
          releaseAgentConnect();
          return { ok: false, error: msg };
        }

        await subscribeToRun(body.runId);
        logEditorTelemetryEvent("agent_run", "connect_ok", "info", body.runId.slice(0, 8));
        return { ok: true };
      } catch (e) {
        const msg = formatAgentFetchError(e);
        teardownChannels();
        setProgress((p) => ({
          ...p,
          error: msg,
          finished: true,
        }));
        return { ok: false, error: msg };
      } finally {
        releaseAgentConnect();
      }
    },
    [postAgentRun, subscribeToRun, teardownChannels, activeRunStartedAtMs],
  );

  const beginPendingTurn = useCallback(() => {
    const startedAtMs = Date.now();
    setActiveRunStartedAtMs(startedAtMs);
    setActiveRunId(PENDING_RUN_ID);
    setProgress({
      ...initialAgentProgress,
      statusHint: "Iniciando…",
      phase: null,
      finished: false,
    });
    return startedAtMs;
  }, []);

  const clearPendingTurn = useCallback(() => {
    setActiveRunStartedAtMs(null);
    setActiveRunId((cur) => (cur === PENDING_RUN_ID ? null : cur));
    setProgress((p) =>
      p.finished ? p : { ...p, finished: true, statusHint: null, phase: null },
    );
  }, []);

  const drainQueue = useCallback(
    async (
      projectId: string,
      conversationId: string,
      mode?: "plan" | "build" | "chat",
    ): Promise<{ ok: boolean; runId?: string; pendingCount?: number; reason?: string }> => {
      try {
        const payload: Record<string, unknown> = {
          action: "drain_queue",
          projectId,
          conversationId,
        };
        if (mode != null) payload.mode = mode; // forward explicit (from layout/coordinator or undefined); omit => backend defaults to build fallback, continue-queue prefers stored from pendingBody
        const res = await postAgentRun(payload);
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
          return {
            ok: true,
            runId: body.runId,
            pendingCount: body.pendingCount,
          };
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
        // Do not pre-mutate runIdRef before subscribe (watch is the coordinator/reconcile/drain/pendingBuild
        // path for new runIds on realtime INSERT/UPDATE and rapid successive turns). Pre-set made isSame=true
        // inside subscribe, skipping !isSame teardown + lastSeqRef=0 + setProgress(initial) even when
        // resetProgress:isNew. Result: high lastSeq from prior run → catchUp .gt() gets 0 rows for new
        // low-seq events (incl start), realtime apply skips via seq guard (fresh bypass requires ===0).
        // Plan→Build: sempre reset completo — nunca herdar streamText/narration/timeline do run anterior.
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
      mode?: "plan" | "build" | "chat",
    ): Promise<{ ok: boolean; pendingCount?: number; message?: string }> => {
      try {
        const res = await postAgentRun({
          projectId,
          conversationId,
          preferences: loadAgentPreferences(),
          sessionKind,
          enqueue: true,
          mode: mode ?? "build",
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
          runId?: string;
          busy?: boolean;
        };
        if (body.queued) {
          setProgress((p) => ({
            ...p,
            pendingQueueCount: body.pendingCount ?? 0,
            statusHint: body.message ?? "Mensagem na fila do agente.",
          }));
          void refreshPendingQueue(projectId, conversationId);
          return {
            ok: true,
            pendingCount: body.pendingCount,
            message: body.message,
          };
        }
        if (body.busy) {
          return {
            ok: false,
            message: body.message ?? "Agente ocupado — envie com enqueue ativo.",
          };
        }
        return {
          ok: false,
          message: body.message ?? "Não foi possível enfileirar a mensagem.",
        };
      } catch (e) {
        return { ok: false, message: formatAgentFetchError(e) };
      }
    },
    [postAgentRun, refreshPendingQueue],
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
          finished: true,
          canceled: true,
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
    clearAgentSnapshot();
  }, [teardownChannels]);

  const disconnect = useCallback(() => {
    runIdRef.current = null;
    setActiveRunId(null);
    teardownChannels();
    setProgress((p) => ({ ...p, finished: true }));
    clearAgentSnapshot();
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
    setProgress((p) => ({
      ...p,
      pendingPlan: null,
      awaiting: false,
      awaitingKind: null,
    }));
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

  const acknowledgeMaterializedRun = useCallback(
    (runId: string) => {
      freezeRunProgress(runId);
      setActiveRunId((cur) => {
        if (cur === runId) {
          runIdRef.current = null;
          return null;
        }
        return cur;
      });
    },
    [freezeRunProgress],
  );

  const bindSession = useCallback((projectId: string, conversationId: string) => {
    sessionContextRef.current = { projectId, conversationId };
  }, []);

  const resetSession = useCallback(() => {
    runIdRef.current = null;
    setActiveRunId(null);
    setActiveRunStartedAtMs(null);
    setConnected(false);
    setProgress(initialAgentProgress);
    setPendingQueueItems([]);
    setQueueBlockingReason(null);
    lastSeqRef.current = 0;
    if (frozenRunProgressRef.current.size > 0) {
      frozenRunProgressRef.current.clear();
      bumpFrozenProgressTick();
    }
    teardownChannels();
    clearAgentSnapshot();
  }, [teardownChannels, bumpFrozenProgressTick]);

  const tryRestoreSnapshot = useCallback(
    (projectId: string, conversationId: string, messages: ChatMessage[] = []) => {
      const snap = loadAgentSnapshot();
      if (!snap) return;
      const age = Date.now() - snap.timestamp;
      if (age > SNAPSHOT_MAX_AGE_MS) {
        clearAgentSnapshot();
        return;
      }
      if (snap.projectId !== projectId || snap.conversationId !== conversationId) {
        clearAgentSnapshot();
        return;
      }

      if (snap.activeRunId) {
        const alreadyInDb = messages.some(
          (m) => m.runId === snap.activeRunId && isAssistantRunMaterialized(m),
        );
        if (alreadyInDb && snap.progress.finished) {
          clearAgentSnapshot();
          return;
        }
      } else if (snap.progress.finished) {
        clearAgentSnapshot();
        return;
      }

      const restoreProgress = () => {
        setProgress((prev) => {
          if (prev !== initialAgentProgress && prev.streamText != null) return prev;
          return snap.progress;
        });
      };

      if (snap.activeRunId) {
        runIdRef.current = snap.activeRunId;
        setActiveRunId(snap.activeRunId);
        lastSeqRef.current = snap.lastSeq;
        restoreProgress();
        void subscribeToRun(snap.activeRunId, { resetProgress: false });
      } else if (
        snap.progress.awaiting &&
        (snap.progress.awaitingKind === "clarify" ||
          (snap.progress.awaitingKind as string | null) === "qualify")
      ) {
        restoreProgress();
      } else if (snap.progress.pendingPlan || snap.progress.awaitingKind === "plan_approval") {
        restoreProgress();
      }
    },
    [subscribeToRun],
  );

  return {
    progress,
    connected,
    activeRunId,
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
    getFrozenRunProgress,
    clearFrozenRunProgress,
    frozenProgressTick,
    bindSession,
    resetSession,
    tryRestoreSnapshot,
    beginPendingTurn,
    clearPendingTurn,
    activeRunStartedAtMs,
    /** @deprecated use activeRunStartedAtMs */
    pendingTurnStartedAtMs: activeRunStartedAtMs,
    isPendingRun: activeRunId === PENDING_RUN_ID,
  };
}
