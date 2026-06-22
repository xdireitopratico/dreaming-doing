/**
 * transitionRun — writer canônico de agent_runs.status (Edge/Deno).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  canTransitionRunStatus,
  partitionRunExtras,
  shouldSetFinishedAt,
} from "./agent-contract-lifecycle.ts";
import type { AgentRunStatus } from "./agent-contract-events.ts";

export { partitionRunExtras };

export type TransitionRunResult = {
  ok: boolean;
  skipped?: boolean;
  from?: AgentRunStatus;
  to?: AgentRunStatus;
};

export async function transitionRun(
  supabase: SupabaseClient,
  runId: string,
  to: AgentRunStatus,
  extras: Record<string, unknown> = {},
): Promise<TransitionRunResult> {
  const { data: row } = await supabase
    .from("agent_runs")
    .select("status, meta")
    .eq("id", runId)
    .maybeSingle();

  const from = (row?.status as AgentRunStatus | undefined) ?? "pending";
  if (!canTransitionRunStatus(from, to)) {
    return { ok: false, skipped: true, from, to };
  }

  const { columns, metaDelta } = partitionRunExtras(extras);
  const patch: Record<string, unknown> = { status: to, ...columns };

  if (shouldSetFinishedAt(to)) {
    patch.finished_at = new Date().toISOString();
  }
  if (to === "awaiting_user" || (to === "running" && from === "failed")) {
    patch.finished_at = null;
  }

  if (Object.keys(metaDelta).length > 0) {
    const prevMeta = (row?.meta ?? {}) as Record<string, unknown>;
    patch.meta = { ...prevMeta, ...metaDelta };
  }

  const { error } = await supabase.from("agent_runs").update(patch).eq("id", runId);
  if (error) throw new Error(`transitionRun ${runId} ${from}→${to}: ${error.message}`);

  return { ok: true, from, to };
}