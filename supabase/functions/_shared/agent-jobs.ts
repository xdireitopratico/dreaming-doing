/**
 * agent_jobs — fila explícita de chunks (Fase 1 control plane).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  canTransitionJobStatus,
  isAgentRuntimeV2ShadowEnabled,
  type AgentJobStatus,
} from "./agent-contract-lifecycle.ts";

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

export function agentRuntimeV2ShadowEnabled(): boolean {
  return isAgentRuntimeV2ShadowEnabled(Deno.env.get("AGENT_RUNTIME_V2"));
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
  if (!agentRuntimeV2ShadowEnabled()) return null;

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
        payload: { ...(input.payload ?? {}), shadow: true },
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
    console.warn("[agent_jobs] shadow upsert failed", error.message);
    return null;
  }
  return (data?.id as string) ?? null;
}

export async function shadowCompleteJob(
  supabase: SupabaseClient,
  runId: string,
  generation: number,
  result: Record<string, unknown>,
  ok: boolean,
): Promise<void> {
  if (!agentRuntimeV2ShadowEnabled()) return;

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
  if (!agentRuntimeV2ShadowEnabled()) return;
  await shadowUpsertAgentJob(supabase, {
    runId,
    generation: nextGeneration,
    status: "queued",
    payload,
  });
}