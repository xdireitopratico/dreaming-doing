import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AgentProgress } from "@/lib/agent-progress";
import { initialAgentProgress } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import { setStreamingTelemetryContext } from "@/lib/streaming-telemetry";
import type { PendingQueueItem } from "@/components/chat/ChatQueueDock";
import {
  planAwaitingProgressRestore,
  planLiveRunRestore,
} from "@/hooks/agent-run/agent-run-restore";

export type SessionContext = { projectId: string; conversationId: string };

export type SessionHandlersDeps = {
  runIdRef: MutableRefObject<string | null>;
  closedRunIdRef: MutableRefObject<string | null>;
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
  const findLatestLiveRun = async (projectId: string, conversationId: string) => {
    const { data: run } = await supabase
      .from("agent_runs")
      .select("id, status, heartbeat_at, started_at, canceled_at")
      .eq("project_id", projectId)
      .eq("conversation_id", conversationId)
      .in("status", ["running", "pending"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return run
      ? {
          id: run.id as string,
          status: run.status as string | null,
          heartbeat_at: run.heartbeat_at as string | null,
          started_at: run.started_at as string | null,
          canceled_at: run.canceled_at as string | null,
        }
      : null;
  };

  const attachLiveRun = async (
    projectId: string,
    conversationId: string,
    opts?: { resetProgress?: boolean },
  ) => {
    const run = await findLatestLiveRun(projectId, conversationId);
    if (!run?.id) return null;

    const isCurrentRun = deps.runIdRef.current === run.id;
    await deps.subscribeToRun(run.id, {
      resetProgress: opts?.resetProgress ?? !isCurrentRun,
    });
    return run.id;
  };

  const bindSession = (projectId: string, conversationId: string) => {
    deps.sessionContextRef.current = { projectId, conversationId };
    setStreamingTelemetryContext({ projectId, runId: deps.runIdRef.current });
  };

  const resetSession = () => {
    deps.runIdRef.current = null;
    deps.closedRunIdRef.current = null;
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
  };

  const tryRestoreSnapshot = async (
    projectId: string,
    conversationId: string,
    messages: ChatMessage[] = [],
  ) => {
    if (deps.runIdRef.current) return;

    const run = await findLatestLiveRun(projectId, conversationId);

    let lastStreamAt: string | null = null;
    if (run) {
      const { data: lastStream } = await supabase
        .from("agent_stream_events")
        .select("created_at")
        .eq("run_id", run.id)
        .order("seq", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastStreamAt = (lastStream?.created_at as string | null) ?? null;
    }

    const livePlan = planLiveRunRestore(
      run,
      lastStreamAt,
      messages,
    );

    if (livePlan.kind === "subscribe") {
      deps.lastSeqRef.current = 0;
      void attachLiveRun(projectId, conversationId, { resetProgress: false });
      return;
    }

    const awaitingProgress = planAwaitingProgressRestore(messages);
    if (awaitingProgress) {
      deps.setProgress((prev) => {
        if (prev !== initialAgentProgress && prev.streamText != null) return prev;
        return awaitingProgress;
      });
      return;
    }

    deps.setActiveRunId(null);
    deps.runIdRef.current = null;
  };

  return { bindSession, resetSession, tryRestoreSnapshot, attachLiveRun };
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
