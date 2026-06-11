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
  initialAgentProgress,
  streamRowToSSEEvent,
} from "@/lib/agent-progress";
import { freezeSnapshot, PENDING_RUN_ID, type FrozenRunSnapshot } from "@/lib/lovable-thread";
import {
  hasMaterializedCardSnapshot,
  runIdFromAssistantMessage,
} from "@/lib/assistant-run-progress";
import type { ChatMessage } from "@/lib/chat-types";
import type { PendingQueueItem } from "@/components/editor/PendingQueuePanel";

function progressHasFirstChatToken(progress: AgentProgress): boolean {
  if (progress.streamText?.trim() || progress.narrationText?.trim()) return true;
  return progress.timeline.some(
    (ev) =>
      ev.type === "assistant_text" &&
      typeof ev.data?.text === "string" &&
      String(ev.data.text).trim().length > 0,
  );
}

function withFrozenLatencyThought(next: AgentProgress, startedAtMs: number | null): AgentProgress {
  if (next.latencyThoughtMs != null || !startedAtMs) return next;
  if (!progressHasFirstChatToken(next)) return next;
  return {
    ...next,
    latencyThoughtMs: Math.max(500, Date.now() - startedAtMs),
  };
}

export type AgentConnectResult = { ok: true } | { ok: false; error: string };

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
const MAX_FROZEN_RUNS = 5;

function pruneFrozenRuns(m: Map<string, FrozenRunSnapshot>): Map<string, FrozenRunSnapshot> {
  if (m.size <= MAX_FROZEN_RUNS) return m;
  const copy = new Map(m);
  const keys = [...copy.keys()];
  while (copy.size > MAX_FROZEN_RUNS) {
    const oldest = keys.shift();
    if (oldest) copy.delete(oldest);
  }
  return copy;
}

function saveAgentSnapshot(snapshot: {
  activeRunId: string | null;
  lastSeq: number;
  progress: AgentProgress;
  frozenRuns: [string, FrozenRunSnapshot][];
}) {
  try {
    const payload = JSON.stringify({ ...snapshot, timestamp: Date.now() });
    sessionStorage.setItem(SESSION_STORAGE_KEY, payload);
  } catch {
    // ignore quota exceeded
  }
}

function loadAgentSnapshot(): {
  activeRunId: string | null;
  lastSeq: number;
  progress: AgentProgress;
  frozenRuns: [string, FrozenRunSnapshot][];
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

  useEffect(() => {
    pendingQueueCountRef.current = progress.pendingQueueCount ?? 0;
  }, [progress.pendingQueueCount]);

  const [connected, setConnected] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [frozenRuns, setFrozenRuns] = useState<Map<string, FrozenRunSnapshot>>(new Map());
  const [pendingQueueItems, setPendingQueueItems] = useState<PendingQueueItem[]>([]);
  const [queueBlockingReason, setQueueBlockingReason] = useState<string | null>(null);
  /** Início do turno (envio) — persiste até o run terminar; alimenta Think latency no chat e inspector. */
  const [activeRunStartedAtMs, setActiveRunStartedAtMs] = useState<number | null>(null);

  const runIdRef = useRef<string | null>(null);
  const activeRunStartedAtMsRef = useRef<number | null>(null);
  useEffect(() => {
    activeRunStartedAtMsRef.current = activeRunStartedAtMs;
  }, [activeRunStartedAtMs]);

  const pendingQueueCountRef = useRef(0);
  const lastSeqRef = useRef(0);
  const eventChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const statusChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stalePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Limpa runId residual quando o job terminou (evita isAgentBusy preso após Done).
  useEffect(() => {
    if (!progress.finished) return;
    if (!runIdRef.current && !activeRunId) return;
    // Qualify: libera composer e ancora thread na mensagem do DB (não no slot live).
    if (progress.awaiting && progress.awaitingKind === "qualify") {
      runIdRef.current = null;
      setActiveRunId(null);
      setActiveRunStartedAtMs(null);
      setConnected(false);
      return;
    }
    if (progress.awaiting) return;
    runIdRef.current = null;
    setActiveRunId(null);
    setActiveRunStartedAtMs(null);
    setConnected(false);
  }, [progress.finished, progress.awaiting, progress.awaitingKind, progress.canceled, activeRunId]);

  // ─── Persistência de estado em sessionStorage ─────────────────────────
  const saveSnapshot = useCallback(() => {
    saveAgentSnapshot({
      activeRunId: runIdRef.current,
      lastSeq: lastSeqRef.current,
      progress,
      frozenRuns: Array.from(frozenRuns.entries()),
    });
  }, [progress, frozenRuns]);

  // Salva snapshot debounced a cada 500ms quando progress muda
  useEffect(() => {
    const timer = setTimeout(saveSnapshot, 500);
    return () => clearTimeout(timer);
  }, [progress, frozenRuns, saveSnapshot]);

  // Recupera snapshot ao montar (sobrevive a F5 / hot-reload)
  useEffect(() => {
    const snap = loadAgentSnapshot();
    if (!snap) return;
    const age = Date.now() - snap.timestamp;
    if (age > SNAPSHOT_MAX_AGE_MS) {
      clearAgentSnapshot();
      return;
    }
    const restoreProgress = () => {
      setProgress((prev) => {
        if (prev !== initialAgentProgress && prev.streamText != null) return prev;
        return snap!.progress;
      });
    };

    if (snap.activeRunId) {
      runIdRef.current = snap.activeRunId;
      setActiveRunId(snap.activeRunId);
      lastSeqRef.current = snap.lastSeq;
      if (snap.frozenRuns.length > 0) {
        setFrozenRuns(pruneFrozenRuns(new Map(snap.frozenRuns)));
      }
      restoreProgress();
      void subscribeToRun(snap.activeRunId, { resetProgress: false });
    } else if (snap.progress.awaiting && snap.progress.awaitingKind === "qualify") {
      restoreProgress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const terminal = t === "finish" || t === "canceled" || t === "error";
      const freezeTerminal = t === "finish" || t === "done" || t === "canceled" || t === "error";
      setProgress((prev) => {
        let next = applyAgentProgressEvent(prev, event);
        next = withFrozenLatencyThought(next, activeRunStartedAtMsRef.current);
        const rid = runIdRef.current;
        if (freezeTerminal && rid) {
          const snap = freezeSnapshot({
            ...next,
            streamText: next.streamText ?? prev.streamText,
            narrationText: next.narrationText ?? prev.narrationText,
            latencyThoughtMs: next.latencyThoughtMs ?? prev.latencyThoughtMs,
          });
          setFrozenRuns((m) => {
            const copy = new Map(m);
            copy.set(rid, snap);
            return pruneFrozenRuns(copy);
          });
        }
        return next;
      });
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

  const persistFrozen = useCallback((snap: AgentProgress) => {
    const rid = runIdRef.current;
    if (!rid) return;
    setFrozenRuns((m) => {
      const copy = new Map(m);
      copy.set(rid, freezeSnapshot(snap));
      return pruneFrozenRuns(copy);
    });
  }, []);

  const syncRunStatus = useCallback(
    (status: string, error: string | null, streamText?: string | null) => {
      setProgress((p) => {
        let next: AgentProgress;
        if (status === "awaiting_user") {
          const planPending =
            p.awaitingKind === "plan_approval" || (p.pendingPlan?.steps?.length ?? 0) > 0;
          next = {
            ...p,
            finished: true,
            awaiting: true,
            awaitingKind: planPending ? "plan_approval" : "qualify",
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
        persistFrozen({
          ...next,
          streamText: streamText ?? next.streamText ?? next.summary ?? p.streamText,
        });
        return {
          ...next,
          streamText: streamText ?? next.streamText ?? next.summary ?? p.streamText,
        };
      });
      // Clear active/connected on terminal — qualify ancora no DB/frozen, não no slot live.
      runIdRef.current = null;
      setActiveRunId(null);
      setConnected(false);
      if (status !== "awaiting_user") {
        clearAgentSnapshot();
      }
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
          setProgress((p) => {
            const next = applyAgentProgressEvent(p, finishEvent);
            persistFrozen(next);
            return next;
          });
          // Clear only the right runId state on terminal (stale synth path) before teardown.
          if (runIdRef.current === runId) {
            runIdRef.current = null;
            setActiveRunId(null);
            setConnected(false);
          }
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
      // Prune old/stale frozen for this (new) active runId so live always wins cleanly on (re)subscribe;
      // historical frozen for prior runs preserved for Lovable multi-turn anchoring.
      setFrozenRuns((m) => {
        if (!m.has(runId)) return m;
        const copy = new Map(m);
        copy.delete(runId);
        return copy;
      });
      setQueueBlockingReason(null);
      const turnInProgress = activeRunStartedAtMsRef.current != null;
      if (!isSame && opts?.resetProgress !== false && !turnInProgress) {
        lastSeqRef.current = 0;
        setProgress({
          ...initialAgentProgress,
          statusHint: "Conectando ao agente…",
        });
      } else if (!isSame && turnInProgress) {
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
              // Clear only the right runId state on terminal (before teardown); consistent with PR3 clears.
              if (runIdRef.current === runId) {
                runIdRef.current = null;
                setActiveRunId(null);
                setConnected(false);
              }
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
            };
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
          phase: p.phase ?? "classify",
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
          const msg = body.message ?? "Agente ocupado.";
          setProgress((p) => ({
            ...p,
            finished: true,
            pendingQueueCount: body.pendingCount ?? p.pendingQueueCount,
            statusHint: msg,
            error: null,
          }));
          releaseAgentConnect();
          return { ok: false, error: msg };
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
      phase: "classify",
      finished: false,
    });
    return startedAtMs;
  }, []);

  const clearPendingTurn = useCallback(() => {
    setActiveRunStartedAtMs(null);
    setActiveRunId((cur) => (cur === PENDING_RUN_ID ? null : cur));
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
        // This re-introduced the "no visible execution" root cause (99% subagent: watch:668/subscribe:305/327
        // + shared lastSeq + catchup-before-channels) for the primary multi-turn subscribe path.
        // Fix: snapshot isNew from pre-call ref value; subscribe's isSame (still seeing prior) drives
        // correct !isSame path (teardown old, set ref, lastSeq=0 since !isSame && opts.reset, fresh start).
        // Matches direct connect/drain (no pre-set) + idempotent guard + existing ref/reset ownership in subscribe.
        // Ensures "start" out-of-seq + catchUp for new run from watch (core to "realtime subscribe" title + double msg).
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
    clearAgentSnapshot();
  }, [persistFrozen, teardownChannels]);

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

  const acknowledgeMaterializedRun = useCallback((runId: string) => {
    setActiveRunId((cur) => {
      if (cur === runId) {
        runIdRef.current = null;
        return null;
      }
      return cur;
    });
  }, []);

  /** Remove frozen só quando o DB tem cardSnapshot — evita gap live→DB. */
  const reconcileFrozenWithMessages = useCallback((messages: ChatMessage[]) => {
    setFrozenRuns((m) => {
      let changed = false;
      const copy = new Map(m);
      for (const runId of copy.keys()) {
        const materialized = messages.some(
          (msg) =>
            msg.role === "assistant" &&
            runIdFromAssistantMessage(msg) === runId &&
            hasMaterializedCardSnapshot(msg),
        );
        if (materialized) {
          copy.delete(runId);
          changed = true;
        }
      }
      return changed ? pruneFrozenRuns(copy) : m;
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
    reconcileFrozenWithMessages,
    beginPendingTurn,
    clearPendingTurn,
    activeRunStartedAtMs,
    /** @deprecated use activeRunStartedAtMs */
    pendingTurnStartedAtMs: activeRunStartedAtMs,
    isPendingRun: activeRunId === PENDING_RUN_ID,
  };
}
