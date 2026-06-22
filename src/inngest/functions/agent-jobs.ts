/**
 * agent_jobs — fila de chunks no worker Inngest (Node).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canTransitionJobStatus,
  isAgentJobsEnabled,
  isAgentRuntimeV2WorkerEnabled,
  type AgentJobStatus,
} from "@forge/agent-contract/lifecycle";

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

function runtimeV2Env(): string | undefined {
  return process.env.AGENT_RUNTIME_V2;
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

export function maxLoopResumeStepsForRuntime(): number {
  return agentJobsEnabled() ? 1 : 3;
}

export async function reclaimExpiredLeasedJobs(
  client: SupabaseClient,
  runId?: string,
): Promise<number> {
  if (!agentJobsEnabled()) return 0;

  const now = new Date().toISOString();
  let query = client
    .from("agent_jobs")
    .select("run_id, generation")
    .eq("status", "leased")
    .lt("lease_until", now);
  if (runId) query = query.eq("run_id", runId);

  const { data, error } = await query;
  if (error || !data?.length) return 0;

  let reclaimed = 0;
  for (const row of data) {
    const { error: updErr } = await client
      .from("agent_jobs")
      .update({ status: "queued", lease_until: null })
      .eq("run_id", row.run_id as string)
      .eq("generation", row.generation as number)
      .eq("status", "leased");
    if (!updErr) reclaimed += 1;
  }
  return reclaimed;
}

export async function leaseQueuedAgentJob(
  client: SupabaseClient,
  runId: string,
): Promise<number | null> {
  if (!agentJobsEnabled()) return null;

  await reclaimExpiredLeasedJobs(client, runId);

  const { data: row } = await client
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
  const { error } = await client
    .from("agent_jobs")
    .update({ status: "leased", lease_until: leaseUntil })
    .eq("run_id", runId)
    .eq("generation", generation)
    .eq("status", "queued");

  if (error) return null;
  return generation;
}

export async function hasQueuedAgentJob(
  client: SupabaseClient,
  runId: string,
): Promise<boolean> {
  if (!agentJobsEnabled()) return true;

  const { data } = await client
    .from("agent_jobs")
    .select("generation")
    .eq("run_id", runId)
    .eq("status", "queued")
    .order("generation", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.generation != null;
}

/** Worker: aguarda job queued (chunk handoff) antes de redispatch Inngest. */
export async function waitForQueuedAgentJob(
  client: SupabaseClient,
  runId: string,
  opts?: { timeoutMs?: number; pollMs?: number },
): Promise<boolean> {
  if (!agentRuntimeV2WorkerEnabled()) return true;

  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const pollMs = opts?.pollMs ?? 500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await hasQueuedAgentJob(client, runId)) return true;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return false;
}