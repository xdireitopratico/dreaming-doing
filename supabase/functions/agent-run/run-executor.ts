/**
 * Execute the agent for a given run. Used by:
 *  - "execute" action: called by Inngest function (Node → HTTP → Deno)
 *  - "run" action: thin dispatcher that creates the row and triggers Inngest
 *
 * The setup is intentionally heavy because the Inngest trigger may not happen
 * immediately (and the user must see status="pending" → "running" transition
 * without delay).
 *
 * Durabilidade via Inngest; chamado sincronamente de um step.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { executeAgentJob, type AgentJobParams } from "./run-job.ts";
import { buildSessionExtensionsPrompt, normalizeIdList } from "../_shared/session-extensions.ts";
import { loadDeployConnectorKeys, type AgentPreferencesPayload } from "./connector-keys.ts";
import type { ProviderConfig } from "./providers.ts";
import {
  loadUserLlmContext,
  resolveAgentProvider,
  resolveExecuteIdList,
  resolveExecutePreferences,
  resolveExecuteSessionKindRaw,
} from "./run-setup.ts";
import { buildStackContext, stackPromptAddon } from "../_shared/stack-context.ts";
import { buildChatHistory } from "./memory.ts";
import { RobinKeyPool } from "./robin-pool.ts";
import { loadUserE2bApiKey } from "../_shared/user-e2b.ts";
import { restoreExecutionLogFromRows } from "./executionLogMeta.ts";
import { loadCheckpoint } from "./checkpoint.ts";
import { buildSandboxEnv } from "./sandbox-env.ts";
import { logger } from "../_shared/logger.ts";
import { appendStreamEvent } from "../_shared/agent-stream.ts";

const MAX_INLINE_CHUNKS = 8;

export type ExecuteParams = {
  runId: string;
  projectId: string;
  conversationId: string;
  userId: string;
  preferences: AgentPreferencesPayload | null;
  sessionKindRaw: string | null;
  enabledSkillIds: string[];
  enabledMcpIds: string[];
  resume: boolean;
  planMode: boolean;
  plan?: string;
  planSourceRunId?: string;
};

export type ExecuteResult = {
  ok: boolean;
  runId: string;
  mode: "plan" | "build";
  resumable: boolean;
  canceled: boolean;
  error?: string;
  stepsCompleted: number;
  durationMs: number;
};

export async function executeAgentRun(
  supabase: SupabaseClient,
  params: ExecuteParams,
): Promise<ExecuteResult> {
  const startMs = Date.now();
  const { runId, projectId, conversationId, userId, resume: resumeRun, planMode } = params;

  // Race-safe cancel check: if the user canceled between Inngest's check
  // and this call, exit early without touching state.
  const { data: preCheck } = await supabase
    .from("agent_runs")
    .select("status, canceled_at, meta")
    .eq("id", runId)
    .maybeSingle();
  const runMeta = (preCheck?.meta ?? {}) as Record<string, unknown>;
  const effectivePreferences = resolveExecutePreferences(params.preferences, runMeta);
  const effectiveSkillIds = resolveExecuteIdList(params.enabledSkillIds, runMeta, "enabledSkillIds");
  const effectiveMcpIds = resolveExecuteIdList(params.enabledMcpIds, runMeta, "enabledMcpIds");
  const effectiveSessionKindRaw = resolveExecuteSessionKindRaw(params.sessionKindRaw, runMeta);

  if (preCheck?.status === "canceled" || preCheck?.canceled_at) {
    return { ok: false, runId, mode: planMode ? "plan" : "build", resumable: false, canceled: true, error: "Cancelado", stepsCompleted: 0, durationMs: Date.now() - startMs };
  }
  if (preCheck?.status === "completed" || preCheck?.status === "failed") {
    return { ok: true, runId, mode: planMode ? "plan" : "build", resumable: false, canceled: false, stepsCompleted: 0, durationMs: Date.now() - startMs };
  }

  // Mark running + set full meta (provider, model, etc.)
  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id, template, meta")
    .eq("id", projectId)
    .single();

  if (!project) {
    return { ok: false, runId, mode: planMode ? "plan" : "build", resumable: false, canceled: false, error: "Projeto não encontrado", stepsCompleted: 0, durationMs: 0 };
  }

  // Load history
  const { data: history } = await supabase
    .from("messages")
    .select("role, parts, tool_calls, meta, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(120);
  const historyRows = history ?? [];

  const restoredExecutionLog = resumeRun ? restoreExecutionLogFromRows(historyRows) : [];
  const loadedCheckpoint = resumeRun
    ? await loadCheckpoint(supabase, projectId, conversationId)
    : null;

  const { userOnlyKeys, hasUserLlmKey } = await loadUserLlmContext(
    supabase,
    userId,
    effectivePreferences,
  );

  type SessionKind = "taste_chat" | "taste_start" | "byok";
  let sessionKind: SessionKind = hasUserLlmKey ? "byok" : "taste_chat";
  if (effectiveSessionKindRaw === "byok") sessionKind = "byok";
  if (effectiveSessionKindRaw === "taste_start") sessionKind = "taste_start";
  if (effectiveSessionKindRaw === "taste_chat") sessionKind = "taste_chat";

  let robinPool: RobinKeyPool | null = null;
  let connectorKeys: Record<string, string> = {};
  let mainCfg: ProviderConfig;
  let effectiveRobin = false;
  let tasteStart = false;

  try {
    const setup = await resolveAgentProvider({
      supabase,
      userId,
      preferences: effectivePreferences,
      sessionKind: sessionKind === "taste_start" ? "taste_start" : "byok",
      userOnlyKeys,
      tasteStartLabelPrefix: sessionKind === "taste_start",
    });
    mainCfg = setup.mainCfg;
    connectorKeys = setup.connectorKeys;
    robinPool = setup.robinPool;
    effectiveRobin = setup.effectiveRobin;
    tasteStart = setup.tasteStart;
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? "Provider LLM não configurado";
    await supabase.from("agent_runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: msg,
    }).eq("id", runId);
    return { ok: false, runId, mode: planMode ? "plan" : "build", resumable: false, canceled: false, error: msg, stepsCompleted: 0, durationMs: Date.now() - startMs };
  }

  const messages = await buildChatHistory(historyRows, 120, mainCfg.model);

  // Allocate sandbox decision
  const lastUserContent = (() => {
    const lastUser = [...historyRows].reverse().find((m: any) => m.role === "user");
    const parts = lastUser?.parts || [];
    const textPart = parts.find((p: any) => p?.type === "text" || typeof p?.text === "string");
    return textPart?.text || textPart?.content || "";
  })();
  const looksLikeInteraction = /quero (só |apenas |uma )?(mensagem|conversa|intera|pergunt|discut|qualif|ideia|brainstorm)|me faz (perguntas|uma pergunta|pergunta)|não (começa|codar|construir|executar|trabalhar) ainda|só conversar|quero (conversar|discutir a ideia)/i.test(lastUserContent)
    || lastUserContent.trim().length < 90;
  const projectHasSandbox = !!(((project as any).meta || {})?.previewSandboxId || ((project as any).meta || {})?.previewReady);
  let projectFileCount = 0;
  try {
    const { count } = await supabase
      .from("project_files")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    projectFileCount = count ?? 0;
  } catch {
    projectFileCount = 0;
  }
  const allocateSandboxLocal = (!looksLikeInteraction && projectFileCount > 0) || projectHasSandbox;

  // Build runMetaBase + update run
  const runMetaBase = {
    provider: mainCfg.label,
    model: mainCfg.model,
    sessionKind: tasteStart ? "taste_start" : "byok",
    resume: resumeRun,
    checkpoint: !!loadedCheckpoint,
    robin: effectiveRobin,
    taste: tasteStart,
    preferences: effectivePreferences ?? {},
    enabledSkillIds: effectiveSkillIds,
    enabledMcpIds: effectiveMcpIds,
  };
  const { data: currentRun } = await supabase
    .from("agent_runs")
    .select("meta")
    .eq("id", runId)
    .maybeSingle();
  const currentMeta = (currentRun?.meta ?? {}) as Record<string, unknown>;
  await supabase
    .from("agent_runs")
    .update({
      status: "running",
      meta: { ...currentMeta, ...runMetaBase, plan: params.plan ?? currentMeta.plan ?? null, planSourceRunId: params.planSourceRunId ?? currentMeta.planSourceRunId ?? null },
    })
    .eq("id", runId);

  const jobParams: AgentJobParams = {
    projectId,
    conversationId,
    userId,
    agentRunId: runId,
    resumeRun,
    preferences: effectivePreferences,
    sessionKindRaw: effectiveSessionKindRaw ?? undefined,
    enabledSkillIds: effectiveSkillIds,
    enabledMcpIds: effectiveMcpIds,
    planMode,
    allocateSandbox: allocateSandboxLocal,
  };

  const onEvent = (type: string, data: Record<string, unknown>) => {
    appendStreamEvent(supabase, runId, type, { type, ...data }).catch(() => {});
  };

  // In-process chunking — same as the previous runChunkedJob logic
  let chunkResume = resumeRun;
  let result: Awaited<ReturnType<typeof executeAgentJob>>;
  let chunks = 0;
  try {
    result = await executeAgentJob(supabase, { ...jobParams, resumeRun: chunkResume }, onEvent);
    chunks = 1;
    while (!result.ok && result.resumable && !result.canceled && chunks < MAX_INLINE_CHUNKS) {
      chunkResume = true;
      await appendStreamEvent(supabase, runId, "resume", {
        type: "resume",
        chunk: chunks + 1,
        message: "Retomando automaticamente no servidor…",
      });
      result = await executeAgentJob(supabase, { ...jobParams, resumeRun: true }, onEvent);
      chunks++;
    }
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? "Agent execution failed";
    await supabase.from("agent_runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: msg,
    }).eq("id", runId);
    return { ok: false, runId, mode: planMode ? "plan" : "build", resumable: false, canceled: false, error: msg, stepsCompleted: 0, durationMs: Date.now() - startMs };
  }

  // Finalize run
  const { data: finalRun } = await supabase
    .from("agent_runs")
    .select("status, meta")
    .eq("id", runId)
    .maybeSingle();
  const finalStatus = finalRun?.status as string | undefined;
  const finalMeta = (finalRun?.meta ?? {}) as Record<string, unknown>;
  const awaitingStates = ["awaiting_user"];
  const isAwaiting = awaitingStates.includes(finalStatus ?? "") || !!finalMeta.awaitingUser;

  let status: string;
  if (result.canceled) {
    status = "canceled";
  } else if (isAwaiting) {
    status = finalStatus!;
  } else if (result.ok) {
    status = "completed";
  } else {
    status = "failed";
  }

  const prevMeta = (finalRun?.meta ?? runMetaBase) as Record<string, unknown>;
  await supabase
    .from("agent_runs")
    .update({
      status,
      finished_at: isAwaiting ? null : new Date().toISOString(),
      steps: result.steps,
      error: result.error ?? null,
      meta: {
        ...prevMeta,
        ...(result.summary ? { summary: result.summary } : {}),
        ...(result.toolsUsed?.length ? { toolsUsed: result.toolsUsed } : {}),
      },
      ...(result.canceled ? { canceled_at: new Date().toISOString() } : {}),
    })
    .eq("id", runId);

  await appendStreamEvent(supabase, runId, "finish", {
    type: "finish",
    ok: result.ok,
    canceled: result.canceled,
    resumable: !result.ok && !!result.resumable && !result.canceled,
    error: result.error ?? null,
    awaiting: isAwaiting,
    steps: result.steps,
    summary: result.summary ?? null,
  });

  logger.info("agent_run.executed", {
    runId,
    mode: planMode ? "plan" : "build",
    ok: result.ok,
    resumable: result.resumable,
    canceled: result.canceled,
    chunks,
    durationMs: Date.now() - startMs,
  });

  return {
    ok: result.ok,
    runId,
    mode: planMode ? "plan" : "build",
    resumable: !!result.resumable,
    canceled: !!result.canceled,
    error: result.error,
    stepsCompleted: result.steps,
    durationMs: Date.now() - startMs,
  };
}
