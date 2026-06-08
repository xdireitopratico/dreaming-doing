import { useEffect, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import { removeRealtimeChannel } from "@/lib/supabase-realtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  clearPendingAgentRun,
  hasAutoRunAttempted,
  markAutoRunAttempted,
  peekPendingAgentRun,
} from "@/lib/agent-auto-run";
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
  runAgent: (
    explicitKind?: ForgeSessionKind,
    explicitAction?: TasteAction,
  ) => boolean;
};

/** Runs que podem receber watch/reconnect com stream. */
const WATCH_RUN_STATUSES = ["running", "pending"] as const;

const STALE_RUN_MS = 15 * 60 * 1000;

function pendingBuildRunKey(projectId: string): string {
  return `forge:pending-build-run:${projectId}`;
}

/**
 * Coordinator: sync pending → watch run ativo (mesma conversa) → drain → auto-run só com flag de projeto novo.
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

  const { syncPendingCount, watch, drainQueue, connected, progress } = agent;

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
      if (isAgentConnectInFlight() || running || connected) return;

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

        const { data: activeRun } = await supabase
          .from("agent_runs")
          .select("id, status, heartbeat_at, started_at")
          .eq("project_id", projectId)
          .eq("conversation_id", conversation.id)
          .in("status", [...WATCH_RUN_STATUSES])
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeRun?.id) {
          const heartbeat = activeRun.heartbeat_at ?? activeRun.started_at;
          const stale =
            heartbeat &&
            Date.now() - new Date(heartbeat).getTime() > STALE_RUN_MS;
          if (!stale && watchedRunIdRef.current !== activeRun.id) {
            watchedRunIdRef.current = activeRun.id;
            await watch(projectId, conversation.id, activeRun.id);
          }
          return;
        }

        watchedRunIdRef.current = null;

        const drain = await drainQueue(projectId, conversation.id);
        if (drain.runId) {
          watchedRunIdRef.current = drain.runId;
          return;
        }

        const flagged = peekPendingAgentRun(projectId, conversation.id);
        if (!flagged) return;
        if (hasAutoRunAttempted(projectId, conversation.id)) return;

        logEditorTelemetryEvent("agent", "auto_run_flagged", "info", conversation.id.slice(0, 8));

        const started = runAgent(resolveSessionKind(tasteQuota));
        if (started) {
          markAutoRunAttempted(projectId, conversation.id);
          clearPendingAgentRun(projectId);
        }
      } finally {
        reconcileInFlightRef.current = false;
      }
    };

    void reconcile();

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
          const row = payload.new as { id?: string; status?: string; conversation_id?: string };
          if (
            row.conversation_id === conversation.id &&
            row.id &&
            row.status &&
            WATCH_RUN_STATUSES.includes(row.status as (typeof WATCH_RUN_STATUSES)[number])
          ) {
            void reconcile();
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
          const row = payload.new as { id?: string; status?: string; conversation_id?: string };
          if (
            row.conversation_id === conversation.id &&
            row.id &&
            row.status &&
            WATCH_RUN_STATUSES.includes(row.status as (typeof WATCH_RUN_STATUSES)[number])
          ) {
            void reconcile();
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) void removeRealtimeChannel(channel);
    };
  }, [
    conversation?.id,
    projectId,
    running,
    connected,
    runAgent,
    tasteQuota,
    watch,
    drainQueue,
  ]);

  useEffect(() => {
    if (!conversation?.id || !progress.finished) return;

    void (async () => {
      await syncPendingCount(projectId, conversation.id);
      if (progress.awaiting || progress.canceled) return;
      if (running || connected || isAgentConnectInFlight()) return;
      const drain = await drainQueue(projectId, conversation.id);
      if (drain.runId) {
        watchedRunIdRef.current = drain.runId;
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
    syncPendingCount,
    drainQueue,
  ]);
}