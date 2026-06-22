import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canTransitionRunStatus,
  shouldSetFinishedAt,
  type AgentRunStatus,
} from "@forge/agent-contract/lifecycle";
import { getSupabaseAdmin } from "./_shared";

const PATCH_COLUMNS = new Set(["error", "steps", "canceled_at", "heartbeat_at"]);

export function partitionRunExtras(extras: Record<string, unknown>): {
  columns: Record<string, unknown>;
  metaDelta: Record<string, unknown>;
} {
  const columns: Record<string, unknown> = {};
  const metaDelta: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(extras)) {
    if (key === "meta" && value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(metaDelta, value as Record<string, unknown>);
      continue;
    }
    if (PATCH_COLUMNS.has(key)) {
      columns[key] = value;
      continue;
    }
    if (key === "status" || key === "finished_at") continue;
    metaDelta[key] = value;
  }

  return { columns, metaDelta };
}

export type TransitionRunResult = {
  ok: boolean;
  skipped?: boolean;
  from?: AgentRunStatus;
  to?: AgentRunStatus;
};

export async function transitionRun(
  runId: string,
  to: AgentRunStatus,
  extras: Record<string, unknown> = {},
  client?: SupabaseClient,
): Promise<TransitionRunResult> {
  const supabase = client ?? getSupabaseAdmin();
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