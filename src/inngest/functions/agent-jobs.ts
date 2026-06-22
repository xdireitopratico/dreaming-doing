/**
 * agent_jobs — fila de chunks no worker Inngest (Node).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canTransitionJobStatus,
  isAgentRuntimeV2ShadowEnabled,
  type AgentJobStatus,
} from "@forge/agent-contract/lifecycle";

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

export function agentRuntimeV2ShadowEnabled(): boolean {
  return isAgentRuntimeV2ShadowEnabled(process.env.AGENT_RUNTIME_V2);
}

export function maxLoopResumeStepsForRuntime(): number {
  return agentRuntimeV2ShadowEnabled() ? 1 : 3;
}

export async function leaseQueuedAgentJob(
  client: SupabaseClient,
  runId: string,
): Promise<number | null> {
  if (!agentRuntimeV2ShadowEnabled()) return null;

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