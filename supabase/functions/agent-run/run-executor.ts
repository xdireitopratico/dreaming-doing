/**
 * Execute the agent for a given run. Used by:
 *  - "execute" action: called by Inngest function (Node → HTTP → Deno)
 *  - "run" action: thin dispatcher that creates the row and triggers Inngest
 *
 * The setup is intentionally heavy because the Inngest trigger may not happen
 * immediately (and the user must see status="pending" → "running" transition
 * without delay).
 *
 * P0: replaces the PGMQ + invokeAgentWorker pattern. Durability is now
 * provided by Inngest; this function is called synchronously from a step.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { executeAgentJob, type AgentJobParams } from "./run-job.ts";
import { buildSessionExtensionsPrompt, normalizeIdList } from "../_shared/session-extensions.ts";
import {
  loadConnectorKeys,
  loadConnectorPools,
  loadDeployConnectorKeys,
  loadForgeTrialRobinPool,
  type AgentPreferencesPayload,
} from "./connector-keys.ts";
import { pickMain, type ProviderConfig } from "./providers.ts";
import {
  defaultRobinModel,
  PLATFORM_ROBIN_TASTE_PRESET_ID,
  resolveModelFromPreferences,
  filterKeysForAutoAllowlist,
} from "../_shared/model-presets.ts";
import { buildStackContext, stackPromptAddon } from "../_shared/stack-context.ts";
import { buildChatHistory } from "./memory.ts";
import { RobinKeyPool } from "./robin-pool.ts";
import { loadUserE2bApiKey } from "../_shared/user-e2b.ts";
import { restoreExecutionLogFromRows } from "./executionLogMeta.ts";
import { loadCheckpoint } from "./checkpoint.ts";
import { buildSandboxEnv } from "./sandbox-env.ts";
import { logger } from "../_shared/logger.ts";
import { appendStreamEvent } from "../_shared/agent-stream.ts";

const MAX_INLINE_CHUNKS = 12;

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

function isRobinMode(p?: AgentPreferencesPayload | null): boolean {
  return p?.mode === "robin" || p?.mode === "rob";
}

function robinProviderConfig(
  poolProvider: "nvidia" | "groq",
  keys: string[],
  modelPresetId?: string,
): ProviderConfig {
  if (keys.length === 0) {
    throw new Error(
      `Modo ROBIN ativo, mas nenhuma chave ${poolProvider.toUpperCase()} no pool. Adicione chaves em /api → Adicionar ao pool.`,
    );
  }
  const wire = defaultRobinModel(poolProvider, modelPresetId);
  return {
    provider: wire.provider,
    apiKey: keys[0]!,
    model: wire.model,
    baseUrl: wire.baseUrl,
    label: `ROBIN · ${wire.label} (${keys.length} chaves)`,
  };
}

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
    .select("status, canceled_at")
    .eq("id", runId)
    .maybeSingle();
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

  // Load connector keys
  const userOnlyKeys = await loadConnectorKeys(supabase, userId, params.preferences ?? undefined);
  const groqPool = await loadConnectorPools(supabase, userId, "groq");
  const nvidiaPool = await loadConnectorPools(supabase, userId, "nvidia");
  const hasUserLlmKey =
    groqPool.length > 0 ||
    nvidiaPool.length > 0 ||
    Object.keys(userOnlyKeys).some((k) =>
      [
        "ANTHROPIC_API_KEY",
        "GROQ_API_KEY",
        "XAI_API_KEY",
        "OPENAI_API_KEY",
        "NVIDIA_API_KEY",
        "GEMINI_API_KEY",
        "OPENROUTER_API_KEY",
        "DEEPSEEK_API_KEY",
        "DASHSCOPE_API_KEY",
        "MINIMAX_API_KEY",
        "MOONSHOT_API_KEY",
        "MIMO_API_KEY",
        "OLLAMA_BASE_URL",
      ].includes(k)
    );

  // Resolve session kind
  type SessionKind = "taste_chat" | "taste_start" | "byok";
  let sessionKind: SessionKind = hasUserLlmKey ? "byok" : "taste_chat";
  if (params.sessionKindRaw === "byok") sessionKind = "byok";
  if (params.sessionKindRaw === "taste_start") sessionKind = "taste_start";
  if (params.sessionKindRaw === "taste_chat") sessionKind = "taste_chat";

  // Setup provider
  let robinPool: RobinKeyPool | null = null;
  let connectorKeys: Record<string, string> = {};
  let mainCfg: ProviderConfig;
  let effectiveRobin = false;
  let tasteStart = false;
  const userWantsRobin = isRobinMode(params.preferences);
  const poolProvider = params.preferences?.poolProvider ?? "groq";

  try {
    if (sessionKind === "taste_start") {
      tasteStart = true;
      const poolKeys = await loadForgeTrialRobinPool(supabase);
      if (poolKeys.length === 0) {
        throw new Error("Start Project: administrador deve configurar pool NVIDIA em API Keys (/api).");
      }
      robinPool = new RobinKeyPool(poolKeys);
      mainCfg = robinProviderConfig("nvidia", poolKeys, PLATFORM_ROBIN_TASTE_PRESET_ID);
      mainCfg.label = `Start Project · Taste · ${mainCfg.label.replace(/^ROBIN · /, "")}`;
      connectorKeys = { NVIDIA_API_KEY: poolKeys[0]! };
      effectiveRobin = true;
    } else if (userWantsRobin) {
      const poolKeys = await loadConnectorPools(supabase, userId, poolProvider);
      robinPool = new RobinKeyPool(poolKeys);
      mainCfg = robinProviderConfig(poolProvider, poolKeys, params.preferences?.robinPoolModelId);
      connectorKeys = poolProvider === "nvidia"
        ? { NVIDIA_API_KEY: poolKeys[0]! }
        : { GROQ_API_KEY: poolKeys[0]! };
      effectiveRobin = true;
    } else {
      connectorKeys = { ...userOnlyKeys };
      if (params.preferences?.mode === "auto") {
        const autoKeys = filterKeysForAutoAllowlist(
          userOnlyKeys,
          params.preferences?.autoAllowedPresetIds,
          params.preferences?.userModelEntries,
        );
        mainCfg = pickMain(autoKeys);
        const n = params.preferences?.autoAllowedPresetIds?.length ?? 0;
        mainCfg.label = `${mainCfg.label} (Auto · ${n > 0 ? `${n} modelo(s)` : "todas as chaves"})`;
      } else {
        const resolved = resolveModelFromPreferences(params.preferences ?? undefined, userOnlyKeys);
        if (!resolved) {
          throw new Error("Chave ausente para o modelo escolhido. Adicione a API Key do provedor em /api.");
        }
        mainCfg = {
          provider: resolved.provider,
          apiKey: resolved.apiKey,
          model: resolved.model,
          baseUrl: resolved.baseUrl,
          label: `${resolved.label} (fixo)`,
        };
      }
    }
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
    preferences: params.preferences ?? undefined,
    sessionKindRaw: params.sessionKindRaw ?? undefined,
    enabledSkillIds: params.enabledSkillIds,
    enabledMcpIds: params.enabledMcpIds,
    planMode,
    allocateSandbox: allocateSandboxLocal,
  };

  // In-process chunking — same as the previous runChunkedJob logic
  let chunkResume = resumeRun;
  let result: Awaited<ReturnType<typeof executeAgentJob>>;
  let chunks = 0;
  try {
    result = await executeAgentJob(supabase, { ...jobParams, resumeRun: chunkResume }, () => {});
    chunks = 1;
    while (!result.ok && result.resumable && !result.canceled && chunks < MAX_INLINE_CHUNKS) {
      chunkResume = true;
      result = await executeAgentJob(supabase, { ...jobParams, resumeRun: true }, () => {});
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
  const awaitingStates = ["awaiting_user", "awaiting_plan_approval"];
  const isAwaiting = awaitingStates.includes(finalStatus ?? "") || !!finalMeta.awaitingUser || !!finalMeta.pendingPlan;

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
