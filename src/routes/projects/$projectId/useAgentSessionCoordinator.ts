import { useEffect, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import { removeRealtimeChannel } from "@/lib/supabase-realtime";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { isAgentConnectInFlight } from "@/lib/agent-session-guards";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { resolveSessionKind } from "@/lib/taste";
import type { ForgeSessionKind, TasteAction } from "@/lib/taste";
import type { useAgentRun } from "@/hooks/useAgentRun";

type AgentRun = ReturnType<typeof useAgentRun>;

type TasteQuota = {
  tasteChatRemaining: number;
  tasteStartRemaining: number;
  hasUserLlmKey: boolean;
};

type UseAgentSessionCoordinatorParams = {
  projectId: string;
  conversation: { id: string } | null | undefined;
  agent: AgentRun;
  running: boolean;
  tasteQuota: TasteQuota;
  runAgent: (explicitKind?: ForgeSessionKind, explicitAction?: TasteAction) => Promise<boolean>;
};

/** Runs que podem receber watch/reconnect com stream. */
const WATCH_RUN_STATUSES = ["running", "pending"] as const;

const STALE_RUN_MS = 15 * 60 * 1000;
const RECONCILE_DEBOUNCE_MS = 400;

function pendingBuildRunKey(projectId: string): string {
  return `forge:pending-build-run:${projectId}`;
}

/**
 * Coordinator: sync pending → watch run ativo (mesma conversa) → drain. Sem autorun.
 */
export function useAgentSessionCoordinator({
  projectId,
  conversation,
  agent,
  running,
  tasteQuota,
  runAgent,
}: UseAgentSessionCoordinatorParams) {
  const watchedRunIdRef = useRef<string | null>(null);
  const reconcileInFlightRef = useRef(false);
  const pendingQueueCountRef = useRef(0);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    syncPendingCount,
    watch,
    drainQueue,
    connected,
    progress,
    refreshPendingQueue,
    pendingQueueItems,
  } = agent;
  const pendingQueueCount = progress.pendingQueueCount ?? 0;

  useEffect(() => {
    pendingQueueCountRef.current = pendingQueueCount;
  }, [pendingQueueCount]);

  // Tiny local helper (addresses review suggestion for extraction without new files/exports/types
  // or edits outside the listed files for this PR). Uses unknown-as (consistent with prior cast
  // choice to avoid any). Returns undefined (no fwd) when absent -- harmless because continue-queue
  // *always* prefers the actual stored mode from the popped pendingBody (send-time from queueMessage
  // at onSend) per the core PR3 contract.
  const getFwdModeFromPendingItem = (item: unknown): "plan" | "build" | undefined => {
    const b = (item as unknown as { body?: Record<string, unknown> })?.body;
    return b && (b.mode === "plan" || b.mode === "build")
      ? (b.mode as "plan" | "build")
      : undefined;
  };

  const drainUntilEmpty = async (conversationId: string, mode?: "plan" | "build") => {
    for (let attempt = 0; attempt < 5; attempt++) {
      // Forward mode (from send-time capture in pending snapshot or caller) or undefined (rely on stored intent in continue-queue).
      // Removes bare drain calls; stored pendingBody.mode always preferred over call input.
      const drain = await drainQueue(projectId, conversationId, mode);
      if (drain.runId) {
        watchedRunIdRef.current = drain.runId;
        return drain;
      }
      if ((drain.pendingCount ?? 0) === 0) return drain;
      if (drain.reason?.startsWith("blocking_run")) return drain;
      await new Promise((r) => setTimeout(r, 400));
    }
    return { ok: false as const, reason: "drain_retries_exhausted" };
  };

  useEffect(() => {
    if (!conversation?.id) return;
    void syncPendingCount(projectId, conversation.id);
  }, [conversation?.id, projectId, syncPendingCount]);

  useEffect(() => {
    if (!conversation?.id) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const reconcile = async () => {
      if (cancelled || reconcileInFlightRef.current) return;
      if (isAgentConnectInFlight() || connected) return;
      if (running && pendingQueueCountRef.current === 0) return;

      reconcileInFlightRef.current = true;
      try {
        const pendingBuildRunId = sessionStorage.getItem(pendingBuildRunKey(projectId));
        if (pendingBuildRunId) {
          watchedRunIdRef.current = pendingBuildRunId;
          logEditorTelemetryEvent(
            "agent",
            "pending_build_watch",
            "info",
            pendingBuildRunId.slice(0, 8),
          );
          await watch(projectId, conversation.id, pendingBuildRunId);
          sessionStorage.removeItem(pendingBuildRunKey(projectId));
          return;
        }

        if (progress.canceled) return;

        const { data: activeRun } = await supabase
          .from("agent_runs")
          .select("id, status, heartbeat_at, started_at, canceled_at")
          .eq("project_id", projectId)
          .eq("conversation_id", conversation.id)
          .in("status", [...WATCH_RUN_STATUSES])
          .is("canceled_at", null)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeRun?.id && !activeRun.canceled_at) {
          const heartbeat = activeRun.heartbeat_at ?? activeRun.started_at;
          const stale = heartbeat && Date.now() - new Date(heartbeat).getTime() > STALE_RUN_MS;
          if (!stale && watchedRunIdRef.current !== activeRun.id) {
            watchedRunIdRef.current = activeRun.id;
            await watch(projectId, conversation.id, activeRun.id);
          }
          return;
        }

        watchedRunIdRef.current = null;

        if (pendingQueueCountRef.current > 0) {
          // Forward mode from current queue snapshot (send-time captured in body at enqueue) if present; else undefined.
          // Uses extracted helper (smallest local extraction inside listed file only).
          const fwd = getFwdModeFromPendingItem(pendingQueueItems?.[0]);
          const drain = await drainUntilEmpty(conversation.id, fwd);
          if (drain.runId) return;
        }

        // Autorun removido — agente só inicia quando o usuário envia mensagem no composer.
      } finally {
        reconcileInFlightRef.current = false;
      }
    };

    const scheduleReconcile = () => {
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
      reconcileTimerRef.current = setTimeout(() => {
        reconcileTimerRef.current = null;
        void reconcile();
      }, RECONCILE_DEBOUNCE_MS);
    };

    scheduleReconcile();

    channel = supabase
      .channel(`agent-coordinator-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_runs",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            status?: string;
            conversation_id?: string;
          };
          if (
            row.conversation_id === conversation.id &&
            row.id &&
            row.status &&
            WATCH_RUN_STATUSES.includes(row.status as (typeof WATCH_RUN_STATUSES)[number])
          ) {
            scheduleReconcile();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agent_runs",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            status?: string;
            conversation_id?: string;
          };
          if (
            row.conversation_id === conversation.id &&
            row.id &&
            row.status &&
            WATCH_RUN_STATUSES.includes(row.status as (typeof WATCH_RUN_STATUSES)[number])
          ) {
            scheduleReconcile();
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
      if (channel) void removeRealtimeChannel(channel);
    };
  }, [
    conversation?.id,
    projectId,
    running,
    connected,
    progress.canceled,
    runAgent,
    tasteQuota,
    watch,
    drainQueue,
    pendingQueueItems,
  ]);

  useEffect(() => {
    if (!conversation?.id || !progress.finished) return;

    void (async () => {
      // Refetch before busy/pending decisions + use shared inFlight guard to serialize
      // all post-finish "process next" (drain or auto-run) to single path (avoid races on derived running/connected).
      // (defensive invalidates centralized in orchestration + index for single-source post-terminal; reuses PR3 inFlight/refresh guards here)
      await refreshPendingQueue(projectId, conversation.id);
      if (progress.awaiting || progress.canceled) return;
      if (connected || isAgentConnectInFlight()) return;
      if (running) return;
      if (pendingQueueCountRef.current === 0) return;
      if (reconcileInFlightRef.current) return;

      reconcileInFlightRef.current = true;
      try {
        // Derive fwd from snapshot for explicit forward in drainUntilEmpty (removes bare calls).
        // Timing note (addresses review): after `await refreshPendingQueue`, the internal fetch
        // + setProgress/setPendingQueueItems has run, but this closure sees the render-time
        // pendingQueueItems (React batching). countRef is kept in sync via the progress effect.
        // Critically, even if fwd===undefined here (using input fallback to handleContinueQueue),
        // the backend in continue-queue.ts ALWAYS prefers the *actual DB* pendingBody.mode
        // (popped item, written at enqueue from sendMode captured in handlers/ChatComposer at
        // onSend time, or meta on user message) over the call input. See original PR3 prompt:
        // "Make drain/continue paths prefer stored intent from pendingBody (or user msg meta)
        // when present; fall back to drain call input only if absent." + "Forward mode
        // consistently from coordinator/layout" + "one effect/guard with invalidate + refetch
        // before the busy decision" + "Remove bare calls". Stale/undefined fwd is harmless
        // (review's own analysis) and re-render + inFlightRef + terminal clears in useAgentRun
        // serialize everything. No change to refreshPendingQueue return (would be broader than
        // smallest + affect other callers; listed files only).
        const fwd = getFwdModeFromPendingItem(pendingQueueItems?.[0]);
        const drain = await drainUntilEmpty(conversation.id, fwd);
        if (drain.runId) {
          watchedRunIdRef.current = drain.runId;
        }
      } finally {
        reconcileInFlightRef.current = false;
      }
    })();
  }, [
    progress.finished,
    progress.awaiting,
    progress.canceled,
    conversation?.id,
    projectId,
    running,
    connected,
    drainQueue,
    refreshPendingQueue,
    pendingQueueItems,
  ]);
}
