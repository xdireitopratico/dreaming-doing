/**
 * useAgentRun — Supabase Realtime for agent_stream_events + agent_runs (P0).
 *
 * Flow: POST agent-run → { runId } → subscribe postgres_changes.
 * One-time catch-up on subscribe; no polling.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type AgentConnectOptions,
  type AgentProgress,
  initialAgentProgress,
} from "@/lib/agent-progress";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";
import { shouldRetainLiveRunSlot } from "@/lib/live-run-overlay";
import { setStreamingTelemetryContext } from "@/lib/streaming-telemetry";
import type { PendingQueueItem } from "@/components/chat/ChatQueueDock";
import { createRunActionHandlers } from "@/hooks/agent-run/agent-run-actions";
import { createFrozenProgressHandlers } from "@/hooks/agent-run/agent-run-frozen";
import {
  createLifecycleHandlers,
  type AgentConnectResult,
} from "@/hooks/agent-run/agent-run-lifecycle";
import { createQueueHandlers } from "@/hooks/agent-run/agent-run-queue";
import {
  createSessionHandlers,
  subscribePendingQueueRealtime,
  type SessionContext,
} from "@/hooks/agent-run/agent-run-session";
import { createRunSubscriptionHandlers } from "@/hooks/agent-run/agent-run-subscribe";
import {
  createStreamRowHandlers,
  type AgentStreamRow,
} from "@/hooks/agent-run/agent-run-stream";

export type { AgentConnectResult };
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
  const [queuePaused, setQueuePaused] = useState(false);
  const [activeRunStartedAtMs, setActiveRunStartedAtMs] = useState<number | null>(null);
  const [frozenProgressTick, setFrozenProgressTick] = useState(0);

  const runIdRef = useRef<string | null>(null);
  const activeRunStartedAtMsRef = useRef<number | null>(null);
  const pendingQueueCountRef = useRef(0);
  const progressRef = useRef<AgentProgress>(initialAgentProgress);
  const frozenRunProgressRef = useRef<Map<string, AgentProgress>>(new Map());
  const lastSeqRef = useRef(0);
  const streamProcessingRef = useRef(false);
  const streamBufferRef = useRef<AgentStreamRow[]>([]);
  const sessionContextRef = useRef<SessionContext | null>(null);
  const eventChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const statusChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stalePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpFrozenProgressTick = useCallback(() => {
    setFrozenProgressTick((n) => n + 1);
  }, []);

  const {
    freezeRunProgress,
    getFrozenRunProgress,
    clearFrozenRunProgress,
    releaseLiveRunSlot,
  } = useMemo(
    () =>
      createFrozenProgressHandlers({
        runIdRef,
        progressRef,
        frozenRunProgressRef,
        setActiveRunId,
        setActiveRunStartedAtMs,
        bumpFrozenProgressTick,
      }),
    [bumpFrozenProgressTick],
  );

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

  const { teardownChannels, subscribeToRun } = useMemo(
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

  const {
    refreshPendingQueue,
    syncPendingCount,
    clearPendingItem,
    clearAllPending,
    updatePendingItem,
    setQueuePaused: setQueuePausedRemote,
    drainQueue,
    queueMessage,
  } = useMemo(
    () =>
      createQueueHandlers({
        setProgress,
        setPendingQueueItems,
        setQueueBlockingReason,
        setQueuePaused,
        subscribeToRun,
      }),
    [subscribeToRun],
  );

  const { connect, watch, beginPendingTurn, clearPendingTurn } = useMemo(
    () =>
      createLifecycleHandlers({
        runIdRef,
        activeRunStartedAtMs,
        setProgress,
        setActiveRunId,
        setActiveRunStartedAtMs,
        setQueueBlockingReason,
        teardownChannels,
        subscribeToRun,
      }),
    [activeRunStartedAtMs, subscribeToRun, teardownChannels],
  );

  const {
    stop,
    disconnect,
    replay,
    clearPendingPlan,
    hydratePendingPlan,
    acknowledgeMaterializedRun,
  } = useMemo(
    () =>
      createRunActionHandlers({
        runIdRef,
        lastSeqRef,
        setProgress,
        setConnected,
        setActiveRunId,
        teardownChannels,
        freezeRunProgress,
      }),
    [teardownChannels, freezeRunProgress],
  );

  const { bindSession, resetSession, tryRestoreSnapshot } = useMemo(
    () =>
      createSessionHandlers({
        runIdRef,
        lastSeqRef,
        sessionContextRef,
        frozenRunProgressRef,
        setProgress,
        setConnected,
        setActiveRunId,
        setActiveRunStartedAtMs,
        setPendingQueueItems,
        setQueueBlockingReason,
        bumpFrozenProgressTick,
        teardownChannels,
        subscribeToRun,
      }),
    [bumpFrozenProgressTick, subscribeToRun, teardownChannels],
  );

  useEffect(() => {
    pendingQueueCountRef.current = progress.pendingQueueCount ?? 0;
  }, [progress.pendingQueueCount]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    activeRunStartedAtMsRef.current = activeRunStartedAtMs;
  }, [activeRunStartedAtMs]);

  useEffect(() => {
    const ctx = sessionContextRef.current;
    if (ctx) {
      setStreamingTelemetryContext({ projectId: ctx.projectId, runId: activeRunId });
    }
  }, [activeRunId]);

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

  useEffect(() => {
    return () => {
      teardownChannels();
    };
  }, [teardownChannels]);

  useEffect(() => {
    const ctx = sessionContextRef.current;
    if (!ctx) return;
    return subscribePendingQueueRealtime(ctx.projectId, ctx.conversationId, () => {
      void refreshPendingQueue(ctx.projectId, ctx.conversationId);
    });
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
    queuePaused,
    clearPendingItem,
    clearAllPending,
    updatePendingItem,
    setQueuePaused: setQueuePausedRemote,
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