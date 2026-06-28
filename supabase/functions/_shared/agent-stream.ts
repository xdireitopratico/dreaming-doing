import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logger } from "./logger.ts";

const seqCounters = new Map<string, number>();
/** Serializa inserts por runId — evita seq duplicado quando emits não são awaited. */
const insertChains = new Map<string, Promise<number>>();
const LIVE_STREAM_EVENT = "stream";

export type LiveStreamRow = {
  run_id: string;
  seq: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

function liveStreamTopic(runId: string): string {
  return `agent-events-${runId}`;
}

async function broadcastStreamEvent(
  supabase: SupabaseClient,
  row: LiveStreamRow,
): Promise<void> {
  try {
    const channel = supabase.channel(liveStreamTopic(row.run_id));
    try {
      const result = await channel.httpSend(LIVE_STREAM_EVENT, row, { timeout: 2500 });
      if (result !== "ok") {
        logger.warn("agent_stream.broadcast_failed", {
          runId: row.run_id,
          seq: row.seq,
          eventType: row.event_type,
          result,
        });
      }
    } finally {
      await supabase.removeChannel(channel);
    }
  } catch (error) {
    logger.warn("agent_stream.broadcast_error", {
      runId: row.run_id,
      seq: row.seq,
      eventType: row.event_type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function appendStreamEventInner(
  supabase: SupabaseClient,
  runId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const prev = seqCounters.get(runId) ?? (await loadMaxSeq(supabase, runId));
  const seq = prev + 1;
  seqCounters.set(runId, seq);
  const row: LiveStreamRow = {
    run_id: runId,
    seq,
    event_type: eventType,
    payload,
    created_at: new Date().toISOString(),
  };

  const broadcastPromise = broadcastStreamEvent(supabase, row);
  const { error } = await supabase.from("agent_stream_events").insert(row);
  await broadcastPromise;
  if (error) {
    logger.error("agent_stream.insert_failed", { runId, eventType, error: error.message });
  }
  return seq;
}

export async function appendStreamEvent(
  supabase: SupabaseClient,
  runId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const prev = insertChains.get(runId) ?? Promise.resolve(0);
  const next = prev
    .catch(() => 0)
    .then(() => appendStreamEventInner(supabase, runId, eventType, payload));
  insertChains.set(runId, next);
  return next;
}

async function loadMaxSeq(supabase: SupabaseClient, runId: string): Promise<number> {
  const { data } = await supabase
    .from("agent_stream_events")
    .select("seq")
    .eq("run_id", runId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.seq === "number" ? data.seq : 0;
}

export async function fetchStreamEventsSince(
  supabase: SupabaseClient,
  runId: string,
  afterSeq: number,
): Promise<Array<{ seq: number; event_type: string; payload: Record<string, unknown> }>> {
  const { data } = await supabase
    .from("agent_stream_events")
    .select("seq, event_type, payload")
    .eq("run_id", runId)
    .gt("seq", afterSeq)
    .order("seq", { ascending: true })
    .limit(200);
  return (data ?? []).map((row) => ({
    seq: row.seq as number,
    event_type: row.event_type as string,
    payload: (row.payload ?? {}) as Record<string, unknown>,
  }));
}

export function clearSeqCache(runId: string): void {
  seqCounters.delete(runId);
}
