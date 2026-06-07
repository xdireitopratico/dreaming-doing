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

export type ExecuteRequest = AgentRunRequest & { action: "execute" };

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

function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const { url, serviceKey } = requireEnv();
    adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

export async function callAgentRunExecutor(payload: ExecuteRequest): Promise<ExecuteResponse> {
  const { url, serviceKey } = requireEnv();
  const response = await fetch(`${url}/functions/v1/agent-run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text };
  }

  if (!response.ok) {
    const errMsg =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : `agent-run returned ${response.status}`;
    throw new Error(errMsg);
  }

  return body as ExecuteResponse;
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

export async function markRunFinal(
  runId: string,
  status: AgentRunStatus,
  extras: Record<string, unknown> = {},
): Promise<void> {
  const patch: Record<string, unknown> = { status, ...extras };
  if (status === "completed" || status === "failed" || status === "canceled") {
    patch.finished_at = new Date().toISOString();
  }
  const { error } = await getSupabaseAdmin().from("agent_runs").update(patch).eq("id", runId);
  if (error) throw new Error(`Failed to mark run ${runId} as ${status}: ${error.message}`);
}

export type ContinueQueueResponse = {
  continued: boolean;
  runId?: string;
  pendingCount?: number;
  reason?: string;
};

/** Após run completar: consome fila e dispara continuação se houver mensagens pendentes. */
export async function drainPendingQueue(
  payload: AgentRunRequest,
): Promise<ContinueQueueResponse> {
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
      planMode: payload.planMode,
    }),
  });

  const text = await response.text();
  try {
    return JSON.parse(text) as ContinueQueueResponse;
  } catch {
    return { continued: false, reason: text.slice(0, 200) || `HTTP ${response.status}` };
  }
}