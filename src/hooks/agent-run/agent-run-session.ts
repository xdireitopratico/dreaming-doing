import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AgentProgress } from "@/lib/agent-progress";
import { initialAgentProgress } from "@/lib/agent-progress";
import { isAssistantRunMaterialized } from "@/lib/assistant-materialized";
import type { ChatMessage } from "@/lib/chat-types";
import { shouldRestoreLiveRun } from "@/lib/agent-snapshot-restore";
import { setStreamingTelemetryContext } from "@/lib/streaming-telemetry";
import type { PendingQueueItem } from "@/components/editor/PendingQueuePanel";
import {
  clearAgentSnapshot,
  loadAgentSnapshot,
  SNAPSHOT_MAX_AGE_MS,
} from "@/hooks/agent-run/agent-run-snapshot";

export type SessionContext = { projectId: string; conversationId: string };

export type SessionHandlersDeps = {
  runIdRef: MutableRefObject<string | null>;
  lastSeqRef: MutableRefObject<number>;
  sessionContextRef: MutableRefObject<SessionContext | null>;
  frozenRunProgressRef: MutableRefObject<Map<string, AgentProgress>>;
  setProgress: Dispatch<SetStateAction<AgentProgress>>;
  setConnected: Dispatch<SetStateAction<boolean>>;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  setActiveRunStartedAtMs: Dispatch<SetStateAction<number | null>>;
  setPendingQueueItems: Dispatch<SetStateAction<PendingQueueItem[]>>;
  setQueueBlockingReason: Dispatch<SetStateAction<string | null>>;
  bumpFrozenProgressTick: () => void;
  teardownChannels: () => void;
  subscribeToRun: (runId: string, opts?: { resetProgress?: boolean }) => Promise<void>;
};

export function createSessionHandlers(deps: SessionHandlersDeps) {
  const bindSession = (projectId: string, conversationId: string) => {
    deps.sessionContextRef.current = { projectId, conversationId };
    setStreamingTelemetryContext({ projectId, runId: deps.runIdRef.current });
  };

  const resetSession = () => {
    deps.runIdRef.current = null;
    deps.setActiveRunId(null);
    deps.setActiveRunStartedAtMs(null);
    deps.setConnected(false);
    deps.setProgress(initialAgentProgress);
    deps.setPendingQueueItems([]);
    deps.setQueueBlockingReason(null);
    deps.lastSeqRef.current = 0;
    if (deps.frozenRunProgressRef.current.size > 0) {
      deps.frozenRunProgressRef.current.clear();
      deps.bumpFrozenProgressTick();
    }
    deps.teardownChannels();
    clearAgentSnapshot();
  };

  const tryRestoreSnapshot = async (
    projectId: string,
    conversationId: string,
    messages: ChatMessage[] = [],
  ) => {
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

    const idleProgress = { ...initialAgentProgress };

    const restoreProgressOnly = (progress: AgentProgress) => {
      deps.setProgress((prev) => {
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
        deps.setActiveRunId(null);
        deps.runIdRef.current = null;
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

      deps.runIdRef.current = snap.activeRunId;
      deps.setActiveRunId(snap.activeRunId);
      deps.lastSeqRef.current = snap.lastSeq;
      restoreProgressOnly(snap.progress);
      void deps.subscribeToRun(snap.activeRunId, { resetProgress: false });
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
    deps.setProgress(idleProgress);
  };

  return { bindSession, resetSession, tryRestoreSnapshot };
}

export function subscribePendingQueueRealtime(
  projectId: string,
  conversationId: string,
  onChange: () => void,
): () => void {
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
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}