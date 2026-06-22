import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  type AgentProgress,
  applyAgentProgressEvent,
  streamRowToSSEEvent,
} from "@/lib/agent-progress";
import { hasTurnVisibleContent } from "@/lib/chat/turn-display";
import { emitStreamingTelemetry } from "@/lib/streaming-telemetry";

export type AgentStreamRow = {
  seq: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at?: string;
  run_id?: string;
};

export function freezeWorkingDuration(
  next: AgentProgress,
  startedAtMs: number | null,
): AgentProgress {
  if (next.workingDurationMs != null || !startedAtMs) return next;
  if (!hasTurnVisibleContent(next)) return next;
  return {
    ...next,
    workingDurationMs: Math.max(1000, Date.now() - startedAtMs),
  };
}

export type StreamProcessorRefs = {
  runIdRef: MutableRefObject<string | null>;
  lastSeqRef: MutableRefObject<number>;
  activeRunStartedAtMsRef: MutableRefObject<number | null>;
  streamProcessingRef: MutableRefObject<boolean>;
  streamBufferRef: MutableRefObject<AgentStreamRow[]>;
};

export function createStreamRowHandlers(
  refs: StreamProcessorRefs,
  setProgress: Dispatch<SetStateAction<AgentProgress>>,
) {
  const applyStreamRow = (row: AgentStreamRow): boolean => {
    const event = streamRowToSSEEvent(row);
    const t = event.type;
    const rowRunId = row.run_id;
    const activeId = refs.runIdRef.current;
    if (rowRunId && activeId && rowRunId !== activeId && t === "start") {
      refs.lastSeqRef.current = 0;
    }
    if (row.seq <= refs.lastSeqRef.current) {
      emitStreamingTelemetry("agent.stream_seq_dropped", {
        seq: row.seq,
        lastSeq: refs.lastSeqRef.current,
        eventType: t,
      });
      return false;
    }
    if (row.seq > refs.lastSeqRef.current + 1) {
      emitStreamingTelemetry("agent.stream_seq_gap", {
        lastSeq: refs.lastSeqRef.current,
        receivedSeq: row.seq,
        gap: row.seq - refs.lastSeqRef.current - 1,
      });
    }
    refs.lastSeqRef.current = row.seq;
    emitStreamingTelemetry("agent.stream_seq_processed", {
      seq: row.seq,
      eventType: t,
    });
    const terminal = t === "finish" || t === "canceled" || t === "error" || t === "done";
    setProgress((prev) => {
      let next = applyAgentProgressEvent(prev, event);
      next = freezeWorkingDuration(next, refs.activeRunStartedAtMsRef.current);
      return next;
    });
    return terminal;
  };

  const enqueueStreamRow = (row: AgentStreamRow): boolean => {
    if (refs.streamProcessingRef.current) {
      refs.streamBufferRef.current.push(row);
      return false;
    }
    refs.streamProcessingRef.current = true;
    try {
      const isTerminal = applyStreamRow(row);
      while (refs.streamBufferRef.current.length > 0) {
        const next = refs.streamBufferRef.current.shift()!;
        if (next.run_id && refs.runIdRef.current && next.run_id !== refs.runIdRef.current) {
          continue;
        }
        applyStreamRow(next);
      }
      return isTerminal;
    } finally {
      refs.streamProcessingRef.current = false;
    }
  };

  return { applyStreamRow, enqueueStreamRow };
}