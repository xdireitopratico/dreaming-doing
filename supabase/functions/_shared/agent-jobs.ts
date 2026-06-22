/**
 * agent_jobs — fila explícita de chunks (Fase 1 control plane).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  canTransitionJobStatus,
  isAgentJobsEnabled,
  isAgentRuntimeV2WorkerEnabled,
  type AgentJobStatus,
} from "./agent-contract-lifecycle.ts";

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

function runtimeV2Env(): string | undefined {
  return Deno.env.get("AGENT_RUNTIME_V2");
}

export function agentJobsEnabled(): boolean {
  return isAgentJobsEnabled(runtimeV2Env());
}

/** @deprecated Use agentJobsEnabled */
export function agentRuntimeV2ShadowEnabled(): boolean {
  return agentJobsEnabled();
}

export function agentRuntimeV2WorkerEnabled(): boolean {
  return isAgentRuntimeV2WorkerEnabled(runtimeV2Env());
}

export type AgentJobRow = {
  id: string;
  run_id: string;
  generation: number;
  status: AgentJobStatus;
  lease_until: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
};

export async function getNextJobGeneration(
  supabase: SupabaseClient,
  runId: string,
): Promise<number> {
  const { data } = await supabase
    .from("agent_jobs")
    .select("generation")
    .eq("run_id", runId)
    .order("generation", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.generation === "number" ? data.generation + 1 : 1;
}

async function upsertAgentJob(
  supabase: SupabaseClient,
  input: {
    runId: string;
    generation: number;
    status?: AgentJobStatus;
    payload?: Record<string, unknown>;
    result?: Record<string, unknown> | null;
  },
): Promise<string | null> {
  if (!agentJobsEnabled()) return null;

  const leaseUntil =
    input.status === "leased"
      ? new Date(Date.now() + DEFAULT_LEASE_MS).toISOString()
      : null;

  const { data, error } = await supabase
    .from("agent_jobs")
    .upsert(
      {
        run_id: input.runId,
        generation: input.generation,
        status: input.status ?? "leased",
        lease_until: leaseUntil,
        payload: input.payload ?? {},
        result: input.result ?? null,
        finished_at:
          input.status === "completed" || input.status === "failed"
            ? new Date().toISOString()
            : null,
      },
      { onConflict: "run_id,generation" },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[agent_jobs] upsert failed", error.message);
    return null;
  }
  return (data?.id as string) ?? null;
}

/** Fase 1.4 — Edge cria job `queued` no dispatch (não em redispatch Inngest). */
export async function enqueueAgentJobOnDispatch(
  supabase: SupabaseClient,
  runId: string,
  payload: Record<string, unknown>,
  opts?: { skipIfQueued?: boolean },
): Promise<number | null> {
  if (!agentJobsEnabled()) return null;

  if (opts?.skipIfQueued) {
    const { data: existing } = await supabase
      .from("agent_jobs")
      .select("generation")
      .eq("run_id", runId)
      .eq("status", "queued")
      .order("generation", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing?.generation != null) return existing.generation as number;
  }

  const generation = await getNextJobGeneration(supabase, runId);
  await upsertAgentJob(supabase, {
    runId,
    generation,
    status: "queued",
    payload: { ...payload, source: "dispatch" },
  });
  return generation;
}

/** Devolve jobs leased expirados à fila `queued`. */
export async function reclaimExpiredLeasedJobs(
  supabase: SupabaseClient,
  runId?: string,
): Promise<number> {
  if (!agentJobsEnabled()) return 0;

  const now = new Date().toISOString();
  let query = supabase
    .from("agent_jobs")
    .select("run_id, generation")
    .eq("status", "leased")
    .lt("lease_until", now);
  if (runId) query = query.eq("run_id", runId);

  const { data, error } = await query;
  if (error || !data?.length) return 0;

  let reclaimed = 0;
  for (const row of data) {
    const { error: updErr } = await supabase
      .from("agent_jobs")
      .update({ status: "queued", lease_until: null })
      .eq("run_id", row.run_id as string)
      .eq("generation", row.generation as number)
      .eq("status", "leased");
    if (!updErr) reclaimed += 1;
  }
  return reclaimed;
}

/** Fase 1.5 — Worker faz lease do job `queued` mais antigo. */
export async function leaseQueuedAgentJob(
  supabase: SupabaseClient,
  runId: string,
): Promise<number | null> {
  if (!agentJobsEnabled()) return null;

  await reclaimExpiredLeasedJobs(supabase, runId);

  const { data: row } = await supabase
    .from("agent_jobs")
    .select("generation, status")
    .eq("run_id", runId)
    .eq("status", "queued")
    .order("generation", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!row?.generation) return null;

  const generation = row.generation as number;
  const from = (row.status as AgentJobStatus) ?? "queued";
  if (!canTransitionJobStatus(from, "leased")) return generation;

  const leaseUntil = new Date(Date.now() + DEFAULT_LEASE_MS).toISOString();
  const { error } = await supabase
    .from("agent_jobs")
    .update({ status: "leased", lease_until: leaseUntil })
    .eq("run_id", runId)
    .eq("generation", generation)
    .eq("status", "queued");

  if (error) {
    console.warn("[agent_jobs] lease failed", error.message);
    return null;
  }
  return generation;
}

async function getActiveLeasedGeneration(
  supabase: SupabaseClient,
  runId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("agent_jobs")
    .select("generation")
    .eq("run_id", runId)
    .eq("status", "leased")
    .order("generation", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.generation === "number" ? data.generation : null;
}

/** Executor: reutiliza leased do worker, lease fila, ou cria leased (fallback). */
export async function resolveJobGenerationForChunk(
  supabase: SupabaseClient,
  runId: string,
  payload: Record<string, unknown>,
): Promise<number | null> {
  if (!agentJobsEnabled()) return null;

  const active = await getActiveLeasedGeneration(supabase, runId);
  if (active != null) return active;

  const leased = await leaseQueuedAgentJob(supabase, runId);
  if (leased != null) return leased;

  if (agentRuntimeV2WorkerEnabled()) {
    console.warn("[agent_jobs] worker mode: nenhum job queued para lease", runId);
    return null;
  }

  const generation = await getNextJobGeneration(supabase, runId);
  await upsertAgentJob(supabase, {
    runId,
    generation,
    status: "leased",
    payload: { ...payload, source: "executor-fallback" },
  });
  return generation;
}

export async function shadowUpsertAgentJob(
  supabase: SupabaseClient,
  input: {
    runId: string;
    generation: number;
    status?: AgentJobStatus;
    payload?: Record<string, unknown>;
    result?: Record<string, unknown> | null;
  },
): Promise<string | null> {
  return upsertAgentJob(supabase, input);
}

export async function shadowCompleteJob(
  supabase: SupabaseClient,
  runId: string,
  generation: number | null,
  result: Record<string, unknown>,
  ok: boolean,
): Promise<void> {
  if (!agentJobsEnabled() || generation == null) return;

  const { data: row } = await supabase
    .from("agent_jobs")
    .select("status")
    .eq("run_id", runId)
    .eq("generation", generation)
    .maybeSingle();

  const from = (row?.status as AgentJobStatus) ?? "leased";
  const to: AgentJobStatus = ok ? "completed" : "failed";
  if (!canTransitionJobStatus(from, to)) return;

  await supabase
    .from("agent_jobs")
    .update({
      status: to,
      result,
      finished_at: new Date().toISOString(),
      lease_until: null,
    })
    .eq("run_id", runId)
    .eq("generation", generation);
}

export async function shadowEnqueueNextChunk(
  supabase: SupabaseClient,
  runId: string,
  nextGeneration: number,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!agentJobsEnabled()) return;
  await upsertAgentJob(supabase, {
    runId,
    generation: nextGeneration,
    status: "queued",
    payload: { ...payload, source: "chunk-handoff" },
  });
}