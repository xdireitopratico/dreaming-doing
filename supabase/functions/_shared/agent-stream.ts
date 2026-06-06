import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

let seqCounters = new Map<string, number>();

export async function appendStreamEvent(
  supabase: SupabaseClient,
  runId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const prev = seqCounters.get(runId) ?? await loadMaxSeq(supabase, runId);
  const seq = prev + 1;
  seqCounters.set(runId, seq);

  const { error } = await supabase.from("agent_stream_events").insert({
    run_id: runId,
    seq,
    event_type: eventType,
    payload,
  });
  if (error) console.error("[agent-stream] insert failed:", error.message);
  return seq;
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