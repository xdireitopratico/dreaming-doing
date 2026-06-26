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
  // Capture sempre em terminal (finish/canceled) para estabilizar "Pensou por Xs"
  // mesmo que o evento terminal chegue antes de "conteúdo visível" no snapshot.
  const isTerminal = next.finished || next.canceled || next.lastFinishOk != null;
  const hasThinking =
    (next.timeline?.some((ev) => ev.type === "thinking_text") ?? false) ||
    next.timeline?.some(
      (ev) =>
        ev.type === "assistant_text" &&
        (ev.data as Record<string, unknown>)?.thinking === true,
    );
  if (!isTerminal && !hasTurnVisibleContent(next) && !hasThinking) return next;
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

  // ── Reordenação de stream: Realtime entrega thinking_text (alta frequência) fora de ordem,
  // e o seq-guard descartava os atrasados → raciocínio perdido. Buffer espera os ausentes
  // chegarem numa janela curta antes de aceitar o gap. Em-ordem aplica síncrono (sem latência).
  const REORDER_WINDOW_MS = 80;
  const reorderBuffer = new Map<number, AgentStreamRow>();
  let reorderTimer: ReturnType<typeof setTimeout> | null = null;

  const isTerminalEventType = (t: string): boolean =>
    t === "finish" || t === "canceled" || t === "error" || t === "done";

  const clearReorder = () => {
    if (reorderTimer != null) {
      clearTimeout(reorderTimer);
      reorderTimer = null;
    }
    reorderBuffer.clear();
  };

  const drainReorderBuffer = () => {
    let r = reorderBuffer.get(refs.lastSeqRef.current + 1);
    while (r) {
      reorderBuffer.delete(r.seq);
      applyStreamRow(r);
      r = reorderBuffer.get(refs.lastSeqRef.current + 1);
    }
    if (reorderBuffer.size === 0 && reorderTimer != null) {
      clearTimeout(reorderTimer);
      reorderTimer = null;
    }
  };

  const flushReorderBuffer = () => {
    reorderTimer = null;
    if (reorderBuffer.size === 0) return;
    // Janela expirou: aceita o menor pendente (gap real) e drena consecutivos.
    const lowest = Math.min(...reorderBuffer.keys());
    const row = reorderBuffer.get(lowest)!;
    reorderBuffer.delete(lowest);
    applyStreamRow(row);
    drainReorderBuffer();
  };

  const scheduleReorderFlush = () => {
    if (reorderTimer != null) return;
    reorderTimer = setTimeout(flushReorderBuffer, REORDER_WINDOW_MS);
  };

  // Aplica com reordenação: em-ordem/terminal (síncrono), gap não-terminal (buffer+timer), atrasado (drop).
  const applyOrdered = (row: AgentStreamRow): boolean => {
    // Reset de run novo precisa ser ANTES do drop-check de seq (espelha applyStreamRow).
    const rowRunId = row.run_id;
    const activeId = refs.runIdRef.current;
    if (rowRunId && activeId && rowRunId !== activeId && row.event_type === "start") {
      refs.lastSeqRef.current = 0;
    }
    if (row.seq <= refs.lastSeqRef.current) {
      emitStreamingTelemetry("agent.stream_seq_dropped", {
        seq: row.seq,
        lastSeq: refs.lastSeqRef.current,
        eventType: row.event_type,
      });
      return false;
    }
    // Terminal nunca bufferiza — aplica direto (mesmo com gap) pra não travar o fim do run.
    if (isTerminalEventType(row.event_type) || row.seq === refs.lastSeqRef.current + 1) {
      const t = applyStreamRow(row);
      drainReorderBuffer();
      if (t) clearReorder();
      return t;
    }
    // gap não-terminal: buffer e espera os ausentes chegarem (janela de reordenação).
    reorderBuffer.set(row.seq, row);
    scheduleReorderFlush();
    return false;
  };

  const enqueueStreamRow = (row: AgentStreamRow): boolean => {
    if (refs.streamProcessingRef.current) {
      refs.streamBufferRef.current.push(row);
      return false;
    }
    refs.streamProcessingRef.current = true;
    try {
      const isTerminal = applyOrdered(row);
      while (refs.streamBufferRef.current.length > 0) {
        const next = refs.streamBufferRef.current.shift()!;
        if (next.run_id && refs.runIdRef.current && next.run_id !== refs.runIdRef.current) {
          continue;
        }
        applyOrdered(next);
      }
      return isTerminal;
    } finally {
      refs.streamProcessingRef.current = false;
    }
  };

  return { applyStreamRow, enqueueStreamRow };
}