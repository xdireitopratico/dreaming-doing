/**
 * Fila agent_pending_messages — enqueue no agent-run; drain via continue_queue.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const STALE_RUN_MS = 15 * 60 * 1000;

export async function expireStaleRuns(
  supabase: SupabaseClient,
  projectId: string,
): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const { data: stale } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("project_id", projectId)
    .in("status", ["running", "pending"])
    .lt("started_at", cutoff);

  if (!stale?.length) return 0;

  const ids = stale.map((r) => r.id);
  await supabase
    .from("agent_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: "Run expirado (zumbi) — tente enviar de novo.",
    })
    .in("id", ids);

  return ids.length;
}

export async function countPendingMessages(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from("agent_pending_messages")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("user_id", userId);
  return count ?? 0;
}

export async function conversationNeedsAgentResponse(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<boolean> {
  const { data: rows } = await supabase
    .from("messages")
    .select("role")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1);

  const last = rows?.[0];
  if (!last) return false;
  return String(last.role ?? "").toLowerCase() === "user";
}

export async function hasBlockingActiveRun(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("project_id", projectId)
    .in("status", ["running", "pending", "awaiting_user"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function clearPendingMessages(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<number> {
  const { data } = await supabase
    .from("agent_pending_messages")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .select("id");
  return data?.length ?? 0;
}

export async function popOldestPendingMessage(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data: row } = await supabase
    .from("agent_pending_messages")
    .select("id, body")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!row?.id) return null;

  await supabase.from("agent_pending_messages").delete().eq("id", row.id);
  return (row.body ?? {}) as Record<string, unknown>;
}

export type QueueDrainDecision = {
  shouldContinue: boolean;
  pendingCount: number;
  needsResponse: boolean;
  blockingRunId: string | null;
};

export async function evaluateQueueDrain(
  supabase: SupabaseClient,
  projectId: string,
  conversationId: string,
  userId: string,
): Promise<QueueDrainDecision> {
  await expireStaleRuns(supabase, projectId);

  const pendingCount = await countPendingMessages(supabase, projectId, userId);
  const needsResponse = await conversationNeedsAgentResponse(supabase, conversationId);
  const blockingRunId = await hasBlockingActiveRun(supabase, projectId);

  const shouldContinue =
    (pendingCount > 0 || needsResponse) &&
    !blockingRunId;

  return { shouldContinue, pendingCount, needsResponse, blockingRunId };
}