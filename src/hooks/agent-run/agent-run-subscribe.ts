import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type AgentProgress,
  applyAgentProgressEvent,
  awaitingKindFromRunMeta,
  initialAgentProgress,
} from "@/lib/agent-progress";
import { clientStaleStreamMs } from "@/lib/agent-stale-thresholds";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { shouldRetainLiveRunSlot } from "@/lib/live-run-overlay";
import { emitStreamingTelemetry } from "@/lib/streaming-telemetry";
import { TERMINAL_STATUSES } from "@/hooks/agent-run/agent-run-connect";
import { freezeWorkingDuration, type AgentStreamRow } from "@/hooks/agent-run/agent-run-stream";

export const MAX_REALTIME_RECONNECT = 3;

type RealtimeChannel = ReturnType<typeof supabase.channel>;

export type RunSubscriptionDeps = {
  runIdRef: MutableRefObject<string | null>;
  closedRunIdRef: MutableRefObject<string | null>;
  lastSeqRef: MutableRefObject<number>;
  pendingQueueCountRef: MutableRefObject<number>;
  activeRunStartedAtMsRef: MutableRefObject<number | null>;
  streamBufferRef: MutableRefObject<AgentStreamRow[]>;
  eventChannelRef: MutableRefObject<RealtimeChannel | null>;
  statusChannelRef: MutableRefObject<RealtimeChannel | null>;
  stalePollRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  reconnectAttemptsRef: MutableRefObject<number>;
  reconnectTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setProgress: Dispatch<SetStateAction<AgentProgress>>;
  setConnected: Dispatch<SetStateAction<boolean>>;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  setActiveRunStartedAtMs: Dispatch<SetStateAction<number | null>>;
  setQueueBlockingReason: Dispatch<SetStateAction<string | null>>;
  enqueueStreamRow: (row: AgentStreamRow) => boolean;
  releaseLiveRunSlot: (runId: string) => void;
};

export function createRunSubscriptionHandlers(deps: RunSubscriptionDeps) {
  let subscribeGeneration = 0;

  const teardownChannels = async () => {
    if (deps.reconnectTimerRef.current) {
      clearTimeout(deps.reconnectTimerRef.current);
      deps.reconnectTimerRef.current = null;
    }
    if (deps.stalePollRef.current) {
      clearInterval(deps.stalePollRef.current);
      deps.stalePollRef.current = null;
    }
    const removals: Promise<unknown>[] = [];
    if (deps.eventChannelRef.current) {
      removals.push(supabase.removeChannel(deps.eventChannelRef.current));
      deps.eventChannelRef.current = null;
    }
    if (deps.statusChannelRef.current) {
      removals.push(supabase.removeChannel(deps.statusChannelRef.current));
      deps.statusChannelRef.current = null;
    }
    if (removals.length > 0) await Promise.allSettled(removals);
    deps.setConnected(false);
  };

  const syncRunStatus = (
    runId: string,
    status: string,
    error: string | null,
    streamText?: string | null,
    runMeta?: Record<string, unknown> | null,
  ) => {
    if (deps.closedRunIdRef.current === runId) return;
    deps.setProgress((p) => {
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
        };
      } else if (status === "canceled") {
        next = {
          ...p,
          finished: true,
          canceled: true,
          resumable: false,
          error: error ?? p.error,
        };
      } else if (status === "completed") {
        next = {
          ...p,
          finished: true,
          lastFinishOk: p.lastFinishOk === false ? false : (p.lastFinishOk ?? true),
          resumable: false,
        };
      } else if (status === "failed") {
        next = {
          ...p,
          finished: true,
          lastFinishOk: false,
          error: error ?? p.error ?? "Agente falhou",
          resumable: false,
        };
      } else {
        return p;
      }
      const merged = {
        ...next,
        streamText: streamText ?? next.streamText ?? next.summary ?? p.streamText,
      };
      return freezeWorkingDuration(merged, deps.activeRunStartedAtMsRef.current);
    });
    deps.setActiveRunStartedAtMs(null);
    void teardownChannels();
    deps.setConnected(false);
    deps.setProgress((p) => {
      if (!shouldRetainLiveRunSlot(p) && deps.runIdRef.current) {
        deps.releaseLiveRunSlot(deps.runIdRef.current);
      }
      return p;
    });
    deps.closedRunIdRef.current = runId;
  };

  const catchUpRun = async (runId: string): Promise<boolean> => {
    if (deps.closedRunIdRef.current === runId) return true;
    const { data: rows, error } = await supabase
      .from("agent_stream_events")
      .select("seq, event_type, payload, created_at")
      .eq("run_id", runId)
      .gt("seq", deps.lastSeqRef.current)
      .order("seq", { ascending: true });

    if (error) {
      logEditorTelemetryEvent("agent_run", "catchup_error", "warn", error.message.slice(0, 120));
    }

    let terminal = false;
    for (const row of rows ?? []) {
      if (
        deps.enqueueStreamRow({
          seq: row.seq as number,
          event_type: row.event_type as string,
          payload: (row.payload ?? {}) as Record<string, unknown>,
          created_at: row.created_at as string | undefined,
          run_id: runId,
          source: "db",
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
      syncRunStatus(runId, "canceled", run.error, undefined, runMeta);
      deps.closedRunIdRef.current = runId;
      return true;
    }
    if (run?.status && TERMINAL_STATUSES.has(run.status)) {
      syncRunStatus(runId, run.status, run.error, undefined, runMeta);
      deps.closedRunIdRef.current = runId;
      return true;
    }

    if (run?.status === "running" || run?.status === "pending") {
      const lastRow = rows?.[rows.length - 1];
      const lastActivity =
        (lastRow?.created_at as string | undefined) ??
        (run.heartbeat_at as string | null) ??
        (run.started_at as string | null);
      const staleMs = clientStaleStreamMs(deps.pendingQueueCountRef.current);
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
        deps.setProgress((p) => applyAgentProgressEvent(p, finishEvent));
        void teardownChannels();
        deps.setConnected(false);
        deps.setProgress((p) => {
          if (!shouldRetainLiveRunSlot(p) && deps.runIdRef.current === runId) {
            deps.releaseLiveRunSlot(runId);
          }
          return p;
        });
        deps.closedRunIdRef.current = runId;
        return true;
      }
    }

    return terminal;
  };

  const subscribeToRun = async (runId: string, opts?: { resetProgress?: boolean }) => {
    const myGeneration = ++subscribeGeneration;
    const isStale = () => myGeneration !== subscribeGeneration || deps.runIdRef.current !== runId;
    const isSame = deps.runIdRef.current === runId;
    if (isSame && deps.eventChannelRef.current) {
      if (deps.closedRunIdRef.current === runId) deps.closedRunIdRef.current = null;
      deps.setConnected(true);
      deps.setQueueBlockingReason(null);
      return;
    }
    if (!isSame) {
      if (deps.closedRunIdRef.current !== runId) deps.closedRunIdRef.current = null;
      deps.streamBufferRef.current = [];
      void teardownChannels();
    }
    deps.runIdRef.current = runId;
    deps.setActiveRunId(runId);
    deps.setQueueBlockingReason(null);
    if (!isSame && opts?.resetProgress !== false) {
      deps.lastSeqRef.current = 0;
      deps.setProgress({
        ...initialAgentProgress,
        statusHint: "Conectando ao agente…",
      });
    } else if (!isSame) {
      deps.lastSeqRef.current = 0;
    }

    deps.setConnected(true);

    const eventChannel = supabase
      .channel(`agent-events-${runId}`)
      .on(
        "broadcast",
        { event: "stream" },
        (payload: { type: "broadcast"; event: string; payload?: AgentStreamRow }) => {
          if (deps.runIdRef.current !== runId) return;
          if (deps.closedRunIdRef.current === runId) return;
          const row = payload.payload ? { ...payload.payload, source: "live" as const } : null;
          if (!row || typeof row.seq !== "number") return;
          if (deps.enqueueStreamRow(row)) {
            deps.closedRunIdRef.current = runId;
            void teardownChannels();
            deps.setConnected(false);
            deps.setProgress((p) => {
              if (!shouldRetainLiveRunSlot(p) && deps.runIdRef.current === runId) {
                deps.releaseLiveRunSlot(runId);
              }
              return p;
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_stream_events",
          filter: `run_id=eq.${runId}`,
        },
        (payload: { new: AgentStreamRow }) => {
          if (deps.runIdRef.current !== runId) return;
          if (deps.closedRunIdRef.current === runId) return;
          const row = { ...(payload.new as AgentStreamRow), source: "db" as const };
          if (deps.enqueueStreamRow(row)) {
            deps.closedRunIdRef.current = runId;
            void teardownChannels();
            deps.setConnected(false);
            deps.setProgress((p) => {
              if (!shouldRetainLiveRunSlot(p) && deps.runIdRef.current === runId) {
                deps.releaseLiveRunSlot(runId);
              }
              return p;
            });
          }
        },
      )
      .subscribe((status: string) => {
        if (isStale()) return;
        if (status === "SUBSCRIBED") {
          deps.reconnectAttemptsRef.current = 0;
          emitStreamingTelemetry("agent.realtime_reconnected", { runId: runId.slice(0, 8) });
          deps.setProgress((p) => ({ ...p, connectionState: "connected" }));
        }
        if (
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
          deps.runIdRef.current === runId
        ) {
          emitStreamingTelemetry("agent.realtime_channel_error", {
            runId: runId.slice(0, 8),
            status,
            attempt: deps.reconnectAttemptsRef.current + 1,
          });
          deps.setProgress((p) => ({ ...p, connectionState: "reconnecting" }));
          if (deps.reconnectAttemptsRef.current >= MAX_REALTIME_RECONNECT) {
            deps.setProgress((p) => ({ ...p, connectionState: "disconnected" }));
            return;
          }
          deps.reconnectAttemptsRef.current += 1;
          const delay = Math.min(500 * 2 ** deps.reconnectAttemptsRef.current, 8000);
          emitStreamingTelemetry("agent.realtime_reconnect", {
            runId: runId.slice(0, 8),
            attempt: deps.reconnectAttemptsRef.current,
            delayMs: delay,
          });
          logEditorTelemetryEvent(
            "agent_run",
            "realtime_reconnect",
            "warn",
            `${runId.slice(0, 8)}:${deps.reconnectAttemptsRef.current}`,
          );
          if (deps.reconnectTimerRef.current) clearTimeout(deps.reconnectTimerRef.current);
          deps.reconnectTimerRef.current = setTimeout(() => {
            if (deps.runIdRef.current !== runId) return;
            void catchUpRun(runId).then(async () => {
              if (deps.runIdRef.current !== runId) return;
              await teardownChannels();
              void subscribeToRun(runId, { resetProgress: false });
            });
          }, delay);
        }
      });
    deps.eventChannelRef.current = eventChannel;
    if (isStale()) {
      void teardownChannels();
      return;
    }

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
        async (payload: { new: { status: string; error: string | null; canceled_at: string | null; meta?: Record<string, unknown> | null } }) => {
          if (deps.runIdRef.current !== runId) return;
          if (deps.closedRunIdRef.current === runId) return;
          const row = payload.new as {
            status: string;
            error: string | null;
            canceled_at: string | null;
            meta?: Record<string, unknown> | null;
          };
          if (!deps.runIdRef.current) return;
          await catchUpRun(deps.runIdRef.current);
          const runMeta = (row.meta ?? null) as Record<string, unknown> | null;
          if (row.canceled_at || row.status === "canceled") {
            syncRunStatus(runId, "canceled", row.error, undefined, runMeta);
            deps.closedRunIdRef.current = runId;
          } else if (TERMINAL_STATUSES.has(row.status)) {
            syncRunStatus(runId, row.status, row.error, undefined, runMeta);
            deps.closedRunIdRef.current = runId;
          }
        },
      )
      .subscribe();
    deps.statusChannelRef.current = statusChannel;
    if (isStale()) {
      void teardownChannels();
      return;
    }

    void catchUpRun(runId).then((terminal) => {
      if (terminal || isStale()) return;

      if (deps.stalePollRef.current) clearInterval(deps.stalePollRef.current);
      deps.stalePollRef.current = setInterval(() => {
        if (!deps.runIdRef.current) return;
        void catchUpRun(deps.runIdRef.current);
      }, 12_000);
    });
  };

  return { teardownChannels, syncRunStatus, catchUpRun, subscribeToRun };
}
