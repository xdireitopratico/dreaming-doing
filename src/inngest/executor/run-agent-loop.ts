import { createClient } from "@supabase/supabase-js";
import type { AgentRunRequest, ExecuteResponse } from "../functions/_shared.ts";
import { requireEnv } from "../functions/_shared.ts";

const INNGEST_LOOP_BUDGET_MS = "270000";

type AgentPreferencesPayload = {
  mode?: "auto" | "robin" | "rob" | "fixed";
  poolProvider?: "nvidia" | "groq";
  fixedPresetId?: string;
  robinPoolModelId?: string;
  customModelId?: string;
  useCustomModel?: boolean;
  autoAllowedPresetIds?: string[];
  userModelEntries?: { slug: string; env: string; label?: string }[];
};

const executorHref = new URL("./agent-executor.js", import.meta.url).href;
let executorImport: Promise<{
  executeAgentRun: (
    supabase: ReturnType<typeof createClient>,
    params: Record<string, unknown>,
  ) => Promise<ExecuteResponse>;
}> | null = null;

function loadExecutor() {
  executorImport ??= import(executorHref) as Promise<{
    executeAgentRun: (
      supabase: ReturnType<typeof createClient>,
      params: Record<string, unknown>,
    ) => Promise<ExecuteResponse>;
  }>;
  return executorImport;
}

/** Executa o agent loop in-process no handler Inngest (Node/Vercel). */
export async function runAgentLoop(
  payload: AgentRunRequest & { resume?: boolean },
): Promise<ExecuteResponse> {
  process.env.INNGEST_EXECUTOR = "1";
  process.env.AGENT_LOOP_BUDGET_MS = INNGEST_LOOP_BUDGET_MS;

  const { executeAgentRun } = await loadExecutor();

  const { url, serviceKey } = requireEnv();
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return await executeAgentRun(supabase as never, {
    runId: payload.runId,
    projectId: payload.projectId,
    conversationId: payload.conversationId,
    userId: payload.userId,
    preferences: (payload.preferences ?? {}) as AgentPreferencesPayload,
    sessionKindRaw: payload.sessionKind ?? null,
    enabledSkillIds: payload.enabledSkillIds ?? [],
    enabledMcpIds: payload.enabledMcpIds ?? [],
    resume: payload.resume === true,
    planMode: payload.planMode === true,
    chatMode: payload.chatMode === true,
    plan: payload.plan,
    planSourceRunId: payload.planSourceRunId,
  });
}
