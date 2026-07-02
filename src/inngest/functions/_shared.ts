import { partitionRunExtras } from "@forge/agent-contract/lifecycle";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/error-utils";

export { errorMessage };

export type AgentRunStatus =
  | "pending"
  | "running"
  | "awaiting_user"
  | "completed"
  | "failed"
  | "canceled";

export type AgentRunRequest = {
  runId: string;
  projectId: string;
  conversationId: string;
  userId: string;
  sessionKind: "taste" | "byok" | "taste_start" | "taste_chat";
  preferences: Record<string, unknown>;
  enabledSkillIds?: string[];
  enabledMcpIds?: string[];
  planMode: boolean;
  chatMode?: boolean;
  plan?: string;
  planSourceRunId?: string;
  resume?: boolean;
};

export type ExecuteResponse = {
  ok: boolean;
  runId: string;
  mode: "plan" | "build" | "chat";
  resumable: boolean;
  canceled: boolean;
  awaiting?: boolean;
  error?: string;
  plan?: string;
  stepsCompleted: number;
  durationMs: number;
};

export class NonRetriableError extends Error {
  override readonly name = "NonRetriableError";
}

export function requireEnv(): { url: string; serviceKey: string } {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Inngest functions",
    );
  }
  return { url, serviceKey };
}

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const { url, serviceKey } = requireEnv();
    adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

/** @deprecated Design DNA still uses multi-chunk resume; agent handlers use a single execute per event. */
export const MAX_LOOP_RESUME_STEPS = 3;

type InngestStep = {
  run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
};

/** Executa o loop uma vez por evento Inngest (sem auto-chunk redispatch). */
export async function runAgentLoopWithResume(
  step: InngestStep,
  payload: AgentRunRequest,
): Promise<ExecuteResponse> {
  const { runAgentLoop } = await import("../executor/run-agent-loop.ts");
  return await step.run("execute-loop-0", async () => {
    return await runAgentLoop(payload);
  });
}

export async function getRunStatus(runId: string): Promise<AgentRunStatus | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("agent_runs")
    .select("status")
    .eq("id", runId)
    .single();

  if (error || !data) return null;
  return (data as { status: AgentRunStatus }).status;
}

/** @deprecated Use partitionRunExtras from @forge/agent-contract/lifecycle */
export const partitionAgentRunExtras = partitionRunExtras;

export async function markRunFinal(
  runId: string,
  status: AgentRunStatus,
  extras: Record<string, unknown> = {},
): Promise<void> {
  const { transitionRun } = await import("./run-lifecycle.ts");
  const result = await transitionRun(runId, status, extras);
  if (!result.ok && result.skipped) return;
}

/** Cancela outras runs ativas no mesmo projeto (evita 2× running na mesma conversa).
 *  SÓ cancela runs com heartbeat stale (> 2min) — preserva runs vivas em outras
 *  abas do mesmo user (Bug #2: 2 abas → run de uma morria "duplicada"). */
export async function cancelDuplicateRuns(projectId: string, activeRunId: string): Promise<number> {
  const STALE_HEARTBEAT_MS = 2 * 60 * 1000;
  const staleCutoff = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
  const { data: dupes } = await getSupabaseAdmin()
    .from("agent_runs")
    .select("id, heartbeat_at, started_at")
    .eq("project_id", projectId)
    .in("status", ["running", "pending"])
    .neq("id", activeRunId);

  let canceled = 0;
  for (const row of dupes ?? []) {
    const dupeId = row.id as string;
    const lastBeat = (row.heartbeat_at as string | null) ?? (row.started_at as string | null);
    // Só cancela se a run duplicada está com heartbeat stale. Se o heartbeat
    // é fresco, outra aba pode estar cuidando dela — deixamos viva.
    if (lastBeat && lastBeat > staleCutoff) continue;
    await markRunFinal(dupeId, "failed", {
      error: "Run duplicado cancelado — outra execução assumiu.",
      meta: { duplicateCanceled: true },
    });
    canceled++;
  }
  return canceled;
}

export async function emitStreamFinishEvent(
  runId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const sb = getSupabaseAdmin();
  const { data: lastRow, error: seqError } = await sb
    .from("agent_stream_events")
    .select("seq")
    .eq("run_id", runId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (seqError) {
    throw new Error(`Failed to read last seq for run ${runId}: ${seqError.message}`);
  }
  const nextSeq = (typeof lastRow?.seq === "number" ? lastRow.seq : 0) + 1;
  const { error: insertError } = await sb.from("agent_stream_events").insert({
    id: crypto.randomUUID(),
    run_id: runId,
    seq: nextSeq,
    event_type: "finish",
    payload,
  });
  if (insertError) {
    throw new Error(`Failed to insert finish event for run ${runId}: ${insertError.message}`);
  }
}

export type ContinueQueueResponse = {
  continued: boolean;
  runId?: string;
  pendingCount?: number;
  reason?: string;
};

/** Após run completar: consome fila e dispara continuação se houver mensagens pendentes.
 * All Inngest dispatches (normal, plan-approve via dispatch_build, queue/continue) are now
 * centralized + hardened in Edge `agent-run` (owns INNGEST_EVENT_KEY + send + loud fail + finish append).
 * Never leaves `pending` run if dispatch cannot be guaranteed.
 */
export async function drainPendingQueue(payload: AgentRunRequest): Promise<ContinueQueueResponse> {
  const { url, serviceKey } = requireEnv();
  const timeoutMs = 15_000;
  const response = await fetch(`${url}/functions/v1/agent-run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      action: "continue_queue",
      projectId: payload.projectId,
      conversationId: payload.conversationId,
      userId: payload.userId,
      // Omit planMode — continue-queue prefers pendingBody.mode (send-time) over drain caller.
    }),
  });

  const text = await response.text();
  try {
    return JSON.parse(text) as ContinueQueueResponse;
  } catch {
    return { continued: false, reason: text.slice(0, 200) || `HTTP ${response.status}` };
  }
}
