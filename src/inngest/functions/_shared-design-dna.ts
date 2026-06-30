import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, MAX_LOOP_RESUME_STEPS } from "./_shared";

export { getSupabaseAdmin, MAX_LOOP_RESUME_STEPS };

export type DesignDnaJobRequest = {
  jobId: string;
  userId: string;
  depth: "shallow" | "deep";
  categories: string[];
  urls: string[];
  ingestKind?: "production" | "curated" | "smoke" | "manual";
  resume?: boolean;
};

export type DesignDnaExecuteResponse = {
  ok: boolean;
  jobId: string;
  status?: "completed" | "failed" | "canceled";
  resumable: boolean;
  canceled: boolean;
  error?: string;
  urlsCompleted: number;
  durationMs: number;
};

export async function saveJobCheckpoint(
  supabase: SupabaseClient,
  jobId: string,
  state: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("design_dna_checkpoints")
    .upsert({ job_id: jobId, state }, { onConflict: "job_id" });
  if (error) {
    throw new Error(`Failed to save checkpoint for job ${jobId}: ${error.message}`);
  }
}

export async function loadJobCheckpoint(
  supabase: SupabaseClient,
  jobId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("design_dna_checkpoints")
    .select("state")
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load checkpoint for job ${jobId}: ${error.message}`);
  }
  return (data?.state as Record<string, unknown> | undefined) ?? null;
}

export async function clearJobCheckpoint(
  supabase: SupabaseClient,
  jobId: string,
): Promise<void> {
  const { error } = await supabase
    .from("design_dna_checkpoints")
    .delete()
    .eq("job_id", jobId);
  if (error) {
    throw new Error(`Failed to clear checkpoint for job ${jobId}: ${error.message}`);
  }
}

export async function markJobFinal(
  supabase: SupabaseClient,
  jobId: string,
  status: string,
  extras: Record<string, unknown> = {},
): Promise<void> {
  const patch: Record<string, unknown> = { status, ...extras };
  if (status === "completed" || status === "partial" || status === "blocked" || status === "failed" || status === "canceled") {
    patch.finished_at = new Date().toISOString();
  }
  const { error } = await supabase.from("design_dna_jobs").update(patch).eq("id", jobId);
  if (error) {
    throw new Error(`Failed to mark job ${jobId} as ${status}: ${error.message}`);
  }
}

export async function appendJobEvent(
  supabase: SupabaseClient,
  jobId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: lastRow } = await supabase
    .from("design_dna_events")
    .select("seq")
    .eq("job_id", jobId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSeq = (typeof lastRow?.seq === "number" ? lastRow.seq : 0) + 1;
  const { error } = await supabase.from("design_dna_events").insert({
    id: crypto.randomUUID(),
    job_id: jobId,
    seq: nextSeq,
    event_type: eventType,
    payload,
  });
  if (error) {
    throw new Error(`Failed to append event for job ${jobId}: ${error.message}`);
  }
}
