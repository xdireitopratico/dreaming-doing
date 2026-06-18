import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  plan?: string;
  planSourceRunId?: string;
  resume?: boolean;
};

export type ExecuteResponse = {
  ok: boolean;
  runId: string;
  mode: "plan" | "build";
  resumable: boolean;
  canceled: boolean;
  error?: string;
  plan?: string;
  stepsCompleted: number;
  durationMs: number;
};

function requireEnv(): { url: string; serviceKey: string } {
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

import { runAgentLoop } from "../executor/run-agent-loop.ts";

/** Chunks Inngest por invocação — cada um com budget ~270s; alinhado a resumeAttempts: 3. */
export const MAX_LOOP_RESUME_STEPS = 3;

type InngestStep = {
  run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
};

/** Executa o loop no handler Inngest; retoma no máximo 3 vezes se o budget expirar. */
export async function runAgentLoopWithResume(
  step: InngestStep,
  payload: AgentRunRequest,
  planMode: boolean,
): Promise<ExecuteResponse> {
  let lastResult: ExecuteResponse | null = null;

  for (let i = 0; i < MAX_LOOP_RESUME_STEPS; i++) {
    const result = await step.run(`execute-loop-${i}`, async () => {
      return await runAgentLoop({ ...payload, planMode, resume: i > 0 });
    });
    lastResult = result;
    if (result.ok || result.canceled || !result.resumable) break;
  }

  if (!lastResult) {
    throw new Error(`No result produced for run ${payload.runId}`);
  }
  return lastResult;
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

const TERMINAL_STATUSES = new Set<AgentRunStatus>(["failed", "canceled"]);

/** Colunas reais de agent_runs — demais chaves em extras viram merge em meta (ex.: plan). */
const AGENT_RUN_PATCH_COLUMNS = new Set(["error", "steps", "canceled_at"]);

export function partitionAgentRunExtras(extras: Record<string, unknown>): {
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
    if (AGENT_RUN_PATCH_COLUMNS.has(key)) {
      columns[key] = value;
      continue;
    }
    if (key === "status" || key === "finished_at") continue;
    metaDelta[key] = value;
  }

  return { columns, metaDelta };
}

export async function markRunFinal(
  runId: string,
  status: AgentRunStatus,
  extras: Record<string, unknown> = {},
): Promise<void> {
  const current = await getRunStatus(runId);

  // Não reverter awaiting_user/completed para running (evita reattach zumbi no mesmo runId).
  if (status === "running" && (current === "awaiting_user" || current === "completed")) {
    return;
  }

  // Não sobrescrever status terminal — se já falhou/cancelou, não reverter pra running
  if (TERMINAL_STATUSES.has(status)) {
    // Só permite marcar terminal se não está num terminal diferente
    if (current === "failed" || current === "canceled") {
      return;
    }
  }

  const { columns, metaDelta } = partitionAgentRunExtras(extras);
  const patch: Record<string, unknown> = { status, ...columns };
  if (status === "completed" || status === "failed" || status === "canceled") {
    patch.finished_at = new Date().toISOString();
  }

  if (Object.keys(metaDelta).length > 0) {
    const { data: existing } = await getSupabaseAdmin()
      .from("agent_runs")
      .select("meta")
      .eq("id", runId)
      .maybeSingle();
    const prevMeta = (existing?.meta ?? {}) as Record<string, unknown>;
    patch.meta = { ...prevMeta, ...metaDelta };
  }

  const { error } = await getSupabaseAdmin().from("agent_runs").update(patch).eq("id", runId);
  if (error) throw new Error(`Failed to mark run ${runId} as ${status}: ${error.message}`);
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
  const response = await fetch(`${url}/functions/v1/agent-run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
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
