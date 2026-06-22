/**
 * useAgentRun — Supabase Realtime for agent_stream_events + agent_runs (P0).
 *
 * Flow: POST agent-run → { runId } → subscribe postgres_changes.
 * One-time catch-up on subscribe; no polling.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import { loadAgentSessionExtensions } from "@/lib/agent-session-extensions";
import type { ForgeSessionKind, TasteAction } from "@/lib/taste";
import { formatAgentFetchError } from "@/lib/agent-fetch-errors";
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
import { dispatchTasteUiAction, isTasteUiAction } from "@/lib/taste-ui-actions";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";
import { shouldRetainLiveRunSlot } from "@/lib/live-run-overlay";
import { isAssistantRunMaterialized } from "@/lib/assistant-materialized";
import { inspectorProgressWeight } from "@/lib/assistant-run-progress";
import type { ChatMessage } from "@/lib/chat-types";
import type { AgentBusyInfo } from "@/lib/agent-busy";
import { parseAgentBusyResponse } from "@/lib/agent-busy";

import type { PendingQueueItem } from "@/components/editor/PendingQueuePanel";
import { shouldRestoreLiveRun } from "@/lib/agent-snapshot-restore";
import { setStreamingTelemetryContext } from "@/lib/streaming-telemetry";
import {
  formatQueueBlockReason,
  parseErrorResponse,
  postAgentRun,
} from "@/hooks/agent-run/agent-run-connect";
import {
  clearAgentSnapshot,
  loadAgentSnapshot,
  saveAgentSnapshot,
  SNAPSHOT_MAX_AGE_MS,
} from "@/hooks/agent-run/agent-run-snapshot";
import { createRunSubscriptionHandlers } from "@/hooks/agent-run/agent-run-subscribe";
import {
  createStreamRowHandlers,
  type AgentStreamRow,
} from "@/hooks/agent-run/agent-run-stream";

export type AgentConnectResult = { ok: true } | { ok: false; error: string; busy?: AgentBusyInfo };

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
  // Fase 1.2 — mutex + buffer: serializa applyStreamRow independentemente da
  // origem (catchUpRun async vs Realtime delivery sync). Sem isso, catchup
  // pode aplicar rows com seq > lastSeqRef enquanto Realtime entrega uma row
  // nova, e o resultado depende da ordem de resolução dos dois `await`.
  const streamProcessingRef = useRef(false);
  const streamBufferRef = useRef<AgentStreamRow[]>([]);

  useEffect(() => {
    pendingQueueCountRef.current = progress.pendingQueueCount ?? 0;
  }, [progress.pendingQueueCount]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    activeRunStartedAtMsRef.current = activeRunStartedAtMs;
  }, [activeRunStartedAtMs]);

  // Sincroniza o contexto de telemetria com o run ativo. Disparado em qualquer
  // mudança de activeRunId (subscribe novo run, release, stop, reset).
  useEffect(() => {
    const ctx = sessionContextRef.current;
    if (ctx) {
      setStreamingTelemetryContext({ projectId: ctx.projectId, runId: activeRunId });
    }
  }, [activeRunId]);

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
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const { enqueueStreamRow } = useMemo(
    () =>
      createStreamRowHandlers(
        {
          runIdRef,
          lastSeqRef,
          activeRunStartedAtMsRef,
          streamProcessingRef,
          streamBufferRef,
        },
        setProgress,
      ),
    [],
  );

  const { teardownChannels, catchUpRun, subscribeToRun } = useMemo(
    () =>
      createRunSubscriptionHandlers({
        runIdRef,
        lastSeqRef,
        pendingQueueCountRef,
        activeRunStartedAtMsRef,
        streamBufferRef,
        eventChannelRef,
        statusChannelRef,
        stalePollRef,
        reconnectAttemptsRef,
        reconnectTimerRef,
        setProgress,
        setConnected,
        setActiveRunId,
        setActiveRunStartedAtMs,
        setQueueBlockingReason,
        enqueueStreamRow,
        releaseLiveRunSlot,
      }),
    [enqueueStreamRow, releaseLiveRunSlot],
  );

  useEffect(() => {
    return () => {
      teardownChannels();
    };
  }, [teardownChannels]);

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
      const directChatMode = options?.mode === "chat";
      teardownChannels();
      setQueueBlockingReason(null);
      const keepPending = activeRunStartedAtMs != null;
      if (keepPending) {
        setProgress((p) => ({
          ...p,
          statusHint: directChatMode ? "Respondendo…" : "Conectando ao agente…",
          finished: false,
          resumable: false,
          phase: p.phase ?? null,
        }));
      } else if (directChatMode) {
        setProgress({
          ...initialAgentProgress,
          statusHint: "Respondendo…",
          finished: false,
          conversational: true,
        });
      } else {
        setProgress({
          ...initialAgentProgress,
          statusHint: "Iniciando agente…",
          resumable: false,
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
            pendingQueueCount: typeof body.pendingCount === "number" ? body.pendingCount : 0,
            statusHint:
              typeof body.message === "string" ? body.message : "Mensagem na fila do agente.",
            error: null,
          }));
          releaseAgentConnect();
          return { ok: true };
        }

        // Chat direto — JSON inline, sem runId (mensagem já salva no DB).
        if (body.ok && body.content && !body.runId) {
          // Session 2.0 — despacha uiActions retornadas pelo taste (open_connector,
          // navigate_setup, lead_saved) como se fossem eventos de stream.
          const uiActions = Array.isArray(body.uiActions) ? body.uiActions : [];
          for (const action of uiActions) {
            if (action && typeof action === "object" && isTasteUiAction(action)) {
              dispatchTasteUiAction(action);
            }
          }
          runIdRef.current = null;
          setActiveRunId(null);
          setActiveRunStartedAtMs(null);
          setProgress((p) => ({
            ...p,
            finished: true,
            lastFinishOk: true,
            conversational: true,
            streamText: typeof body.content === "string" ? body.content : null,
            statusHint: body.chat ? "Resposta enviada." : "Resposta Taste enviada.",
          }));
          releaseAgentConnect();
          return { ok: true };
        }

        const runId = typeof body.runId === "string" ? body.runId : null;
        if (!runId) {
          const msg = "Resposta inválida do servidor";
          setProgress((p) => ({
            ...p,
            error: msg,
            finished: true,
          }));
          releaseAgentConnect();
          return { ok: false, error: msg };
        }

        await subscribeToRun(runId);
        logEditorTelemetryEvent("agent_run", "connect_ok", "info", runId.slice(0, 8));
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
    setProgress((p) => (p.finished ? p : { ...p, finished: true, statusHint: null, phase: null }));
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
        setActiveRunStartedAtMs(Date.now());
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
    setStreamingTelemetryContext({ projectId, runId: runIdRef.current });
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
    async (projectId: string, conversationId: string, messages: ChatMessage[] = []) => {
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

      const idleProgress = {
        ...initialAgentProgress,
      };

      const restoreProgressOnly = (progress: AgentProgress) => {
        setProgress((prev) => {
          if (prev !== initialAgentProgress && prev.streamText != null) return prev;
          return { ...progress };
        });
      };

      if (snap.activeRunId) {
        const alreadyInDb = messages.some(
          (m) => m.runId === snap.activeRunId && isAssistantRunMaterialized(m),
        );
        if (alreadyInDb && snap.progress.finished) {
          clearAgentSnapshot();
          return;
        }

        const { data: run } = await supabase
          .from("agent_runs")
          .select("id, status, heartbeat_at, started_at, canceled_at")
          .eq("id", snap.activeRunId)
          .maybeSingle();

        const { data: lastStream } = await supabase
          .from("agent_stream_events")
          .select("created_at")
          .eq("run_id", snap.activeRunId)
          .order("seq", { ascending: false })
          .limit(1)
          .maybeSingle();

        const fresh = shouldRestoreLiveRun({
          status: run?.status ?? null,
          canceledAt: (run?.canceled_at as string | null) ?? null,
          heartbeatAt: (run?.heartbeat_at as string | null) ?? null,
          startedAt: (run?.started_at as string | null) ?? null,
          lastStreamAt: (lastStream?.created_at as string | null) ?? null,
        });

        if (!fresh) {
          clearAgentSnapshot();
          setActiveRunId(null);
          runIdRef.current = null;
          const awaitingClarify =
            snap.progress.awaiting &&
            (snap.progress.awaitingKind === "clarify" ||
              (snap.progress.awaitingKind as string | null) === "qualify");
          const awaitingPlan =
            snap.progress.awaitingKind === "plan_approval" && !!snap.progress.pendingPlan;
          if (awaitingClarify || awaitingPlan) {
            restoreProgressOnly({
              ...snap.progress,
              finished: true,
            });
          } else {
            restoreProgressOnly(idleProgress);
          }
          return;
        }

        runIdRef.current = snap.activeRunId;
        setActiveRunId(snap.activeRunId);
        lastSeqRef.current = snap.lastSeq;
        restoreProgressOnly(snap.progress);
        void subscribeToRun(snap.activeRunId, { resetProgress: false });
        return;
      }

      if (snap.progress.finished) {
        clearAgentSnapshot();
        return;
      }

      if (
        snap.progress.awaiting &&
        (snap.progress.awaitingKind === "clarify" ||
          (snap.progress.awaitingKind as string | null) === "qualify")
      ) {
        restoreProgressOnly(snap.progress);
        return;
      }

      if (snap.progress.pendingPlan || snap.progress.awaitingKind === "plan_approval") {
        restoreProgressOnly(snap.progress);
        return;
      }

      clearAgentSnapshot();
      setProgress(idleProgress);
    },
    [subscribeToRun],
  );

  // Realtime: agent_pending_messages INSERT/DELETE → refaz fetch da fila.
  // Cobre Bug #5 (fila órfã): INSERT de nova pendente + DELETE após drain.
  useEffect(() => {
    const ctx = sessionContextRef.current;
    if (!ctx) return;
    const { projectId, conversationId } = ctx;
    const channel = supabase
      .channel(`agent-pending-queue-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_pending_messages",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void refreshPendingQueue(projectId, conversationId);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeRunId, refreshPendingQueue]);

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
