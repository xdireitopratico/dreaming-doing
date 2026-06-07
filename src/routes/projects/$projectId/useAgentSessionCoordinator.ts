import { useEffect, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import { removeRealtimeChannel } from "@/lib/supabase-realtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  clearPendingAgentRun,
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
  pendingAgentRunKey: string | null;
  tasteQuota: TasteQuota;
  runAgent: (
    explicitKind?: ForgeSessionKind,
    explicitAction?: TasteAction,
  ) => boolean;
};

const ACTIVE_RUN_STATUSES = ["running", "pending", "awaiting_user"] as const;

/**
 * Single coordinator for agent session lifecycle:
 * sync pending → watch active run → drain queue → one-shot auto-run.
 */
export function useAgentSessionCoordinator({
  projectId,
  conversation,
  agent,
  running,
  pendingAgentRunKey,
  tasteQuota,
  runAgent,
}: UseAgentSessionCoordinatorParams) {
  const autoAgentRunAttemptedRef = useRef<string | null>(null);
  const watchedRunIdRef = useRef<string | null>(null);
  const reconcileInFlightRef = useRef(false);

  const {
    syncPendingCount,
    watch,
    drainQueue,
    connected,
    progress,
  } = agent;

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
        const { data: activeRun } = await supabase
          .from("agent_runs")
          .select("id, status")
          .eq("project_id", projectId)
          .in("status", [...ACTIVE_RUN_STATUSES])
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeRun?.id) {
          if (watchedRunIdRef.current !== activeRun.id) {
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
        const pending = pendingAgentRunKey;
        if (!flagged && !pending) return;

        const attemptKey = pending ?? `flag:${conversation.id}`;
        if (autoAgentRunAttemptedRef.current === attemptKey) return;

        logEditorTelemetryEvent(
          "agent",
          flagged ? "auto_run_flagged" : "auto_run_pending_user",
          "info",
          attemptKey.slice(0, 24),
        );

        if (runAgent(resolveSessionKind(tasteQuota))) {
          autoAgentRunAttemptedRef.current = attemptKey;
          if (flagged) clearPendingAgentRun(projectId);
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
          const row = payload.new as { id?: string; status?: string };
          if (row.id && row.status && ACTIVE_RUN_STATUSES.includes(row.status as (typeof ACTIVE_RUN_STATUSES)[number])) {
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
          const row = payload.new as { id?: string; status?: string };
          if (row.id && row.status && ACTIVE_RUN_STATUSES.includes(row.status as (typeof ACTIVE_RUN_STATUSES)[number])) {
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
    pendingAgentRunKey,
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