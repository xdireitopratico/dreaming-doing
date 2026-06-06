/**
 * Núcleo de execução compartilhado entre agent-run (fallback inline) e agent-worker (PGMQ).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ToolRegistry } from "./registry.ts";
import { AgentLoop } from "./loop.ts";
import { createSandboxProvider } from "./sandbox.ts";
import { registerFsTools } from "./tools/fs.ts";
import { registerShellTool } from "./tools/shell.ts";
import { LoopPhase, type AgentState } from "./types.ts";
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
import { RobinKeyPool, ResilientLLM } from "./robin-pool.ts";
import { loadUserE2bApiKey } from "../_shared/user-e2b.ts";
import { buildSessionExtensionsPrompt, normalizeIdList } from "../_shared/session-extensions.ts";
import { registerMcpForgeTools } from "./tools/mcp-forge.ts";
import { registerDeployTool } from "./tools/deploy.ts";
import { restoreExecutionLogFromRows } from "./executionLogMeta.ts";
import { loadCheckpoint } from "./checkpoint.ts";
import { buildSandboxEnv } from "./sandbox-env.ts";

export type AgentJobParams = {
  projectId: string;
  conversationId: string;
  userId: string;
  agentRunId: string;
  resumeRun: boolean;
  preferences?: AgentPreferencesPayload;
  sessionKindRaw?: string;
  enabledSkillIds: string[];
  enabledMcpIds: string[];
  /** Fase 4.6 plan mode: emite plan_proposed + pausa pra aprovação. */
  planMode?: boolean;
};

function isRobinMode(p?: AgentPreferencesPayload): boolean {
  return p?.mode === "robin" || p?.mode === "rob";
}

function robinProviderConfig(
  poolProvider: "nvidia" | "groq",
  keys: string[],
  modelPresetId?: string,
): ProviderConfig {
  const wire = defaultRobinModel(poolProvider, modelPresetId);
  return {
    provider: wire.provider,
    apiKey: keys[0]!,
    model: wire.model,
    baseUrl: wire.baseUrl,
    label: `ROBIN · ${wire.label} (${keys.length} chaves)`,
  };
}

export async function executeAgentJob(
  supabase: SupabaseClient,
  params: AgentJobParams,
  onEvent: (type: string, data: Record<string, unknown>) => void,
): Promise<{
  ok: boolean;
  summary?: string;
  error?: string;
  steps: number;
  resumable?: boolean;
  canceled?: boolean;
  toolsUsed?: string[];
}> {
  const {
    projectId, conversationId, userId, agentRunId, resumeRun,
    preferences, sessionKindRaw, enabledSkillIds, enabledMcpIds,
    planMode = false,
  } = params;

  const { data: project } = await supabase
    .from("projects").select("id, owner_id, template, meta").eq("id", projectId).single();
  if (!project || project.owner_id !== userId) {
    throw new Error("Projeto não encontrado");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("integration_prefs")
    .eq("id", userId)
    .maybeSingle();

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

  const userOnlyKeys = await loadConnectorKeys(supabase, userId, preferences);
  const groqPool = await loadConnectorPools(supabase, userId, "groq");
  const nvidiaPool = await loadConnectorPools(supabase, userId, "nvidia");
  const hasUserLlmKey =
    groqPool.length > 0 || nvidiaPool.length > 0 ||
    Object.keys(userOnlyKeys).length > 0;

  type SessionKind = "taste_start" | "byok";
  let sessionKind: SessionKind = "byok";
  if (sessionKindRaw === "taste_start") sessionKind = "taste_start";
  if (sessionKindRaw === "taste") sessionKind = "taste_start";

  let robinPool: RobinKeyPool | null = null;
  let connectorKeys: Record<string, string> = {};
  let mainCfg: ProviderConfig;
  let effectiveRobin = false;
  let tasteStart = false;
  const userWantsRobin = isRobinMode(preferences);
  const poolProvider = preferences?.poolProvider ?? "groq";

  if (sessionKind === "taste_start") {
    tasteStart = true;
    const poolKeys = await loadForgeTrialRobinPool(supabase);
    if (poolKeys.length === 0) throw new Error("Start Project: pool NVIDIA ausente.");
    robinPool = new RobinKeyPool(poolKeys);
    mainCfg = robinProviderConfig("nvidia", poolKeys, PLATFORM_ROBIN_TASTE_PRESET_ID);
    connectorKeys = { NVIDIA_API_KEY: poolKeys[0]! };
    effectiveRobin = true;
  } else if (userWantsRobin) {
    const poolKeys = await loadConnectorPools(supabase, userId, poolProvider);
    robinPool = new RobinKeyPool(poolKeys);
    mainCfg = robinProviderConfig(poolProvider, poolKeys, preferences?.robinPoolModelId);
    connectorKeys = poolProvider === "nvidia"
      ? { NVIDIA_API_KEY: poolKeys[0]! }
      : { GROQ_API_KEY: poolKeys[0]! };
    effectiveRobin = true;
  } else {
    connectorKeys = { ...userOnlyKeys };
    if (preferences?.mode === "auto") {
      const autoKeys = filterKeysForAutoAllowlist(
        userOnlyKeys,
        preferences?.autoAllowedPresetIds,
        preferences?.userModelEntries,
      );
      mainCfg = pickMain(autoKeys);
    } else {
      const resolved = resolveModelFromPreferences(preferences, userOnlyKeys);
      if (!resolved) throw new Error("Chave ausente para o modelo escolhido.");
      mainCfg = {
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        model: resolved.model,
        baseUrl: resolved.baseUrl,
        label: resolved.label,
      };
    }
  }

  const messages = await buildChatHistory(historyRows, 120, mainCfg.model);
  const sessionExt = await buildSessionExtensionsPrompt(enabledSkillIds, enabledMcpIds);

  const e2bKey = await loadUserE2bApiKey(supabase, userId);
  if (!e2bKey?.trim()) throw new Error("Sandbox E2B não configurado");

  const reg = new ToolRegistry();
  const sandbox = createSandboxProvider(e2bKey, undefined, supabase, projectId);
  const projectTemplate = (project as { template?: string }).template ?? "vite-react";
  const projectMeta = ((project as { meta?: Record<string, unknown> }).meta ?? {}) as Record<string, unknown>;
  const deployKeys = await loadDeployConnectorKeys(supabase, userId);
  const stackCtx = buildStackContext(profile?.integration_prefs, projectMeta, { ...connectorKeys, ...deployKeys });
  const stackAddon = stackPromptAddon(stackCtx);

  registerFsTools(reg, { supabase, projectId });
  registerShellTool(reg, {
    sandbox,
    projectId,
    supabase,
    sandboxEnv: buildSandboxEnv(connectorKeys, deployKeys),
  });
  registerMcpForgeTools(reg, {
    supabase,
    projectId,
    userId,
    enabledMcpIds,
    deployKeys,
    context7ApiKey: Deno.env.get("CONTEXT7_API_KEY") ?? undefined,
  });
  const deployTokenKey =
    stackCtx.deployTarget === "vercel" ? "VERCEL_TOKEN"
      : stackCtx.deployTarget === "netlify" ? "NETLIFY_TOKEN"
        : stackCtx.deployTarget === "cloudflare" ? "CLOUDFLARE_API_TOKEN"
          : null;
  registerDeployTool(reg, {
    supabase,
    projectId,
    userId,
    deployTarget: stackCtx.deployTarget,
    hasDeployToken: deployTokenKey ? !!deployKeys[deployTokenKey] : false,
  });

  const buildState = (): AgentState => {
    if (loadedCheckpoint) {
      const cp = loadedCheckpoint.state;
      return {
        ...cp,
        projectId,
        conversationId,
        userId,
        messages: cp.messages.length >= messages.length ? cp.messages : [...messages],
        executionLog: cp.executionLog.length > 0 ? cp.executionLog : [...restoredExecutionLog],
      };
    }
    return {
      projectId, conversationId, userId,
      messages: [...messages],
      phase: LoopPhase.GATHER_CONTEXT,
      currentStepIndex: 0,
      context: null, intent: null, plan: null,
      validationResults: [],
      executionLog: [...restoredExecutionLog],
      retryFeedback: null,
      totalSteps: 0,
    };
  };

  const streamEmit = (type: string, data: Record<string, unknown>) => onEvent(type, data);
  const resilientMain = new ResilientLLM(mainCfg, robinPool, streamEmit);

  const loop = new AgentLoop(
    reg,
    resilientMain,
    supabase,
    buildState(),
    (event) => onEvent(event.type, event.data as Record<string, unknown>),
    connectorKeys,
    { main: resilientMain, cheap: resilientMain },
    effectiveRobin,
    projectTemplate,
    stackAddon,
    tasteStart
      ? { maxSteps: 14, tasteStart: true, sessionAddon: sessionExt.addon, userSkillNames: sessionExt.skillNames, runId: agentRunId, planMode }
      : {
        sessionAddon: sessionExt.addon,
        userSkillNames: sessionExt.skillNames,
        resumeRun,
        hasCheckpoint: !!loadedCheckpoint,
        resumePhase: loadedCheckpoint?.phase ?? null,
        complexityScore: loadedCheckpoint?.extra.complexityScore,
        maxStepsFromCheckpoint: loadedCheckpoint?.extra.maxStepsLimit,
        runId: agentRunId,
        planMode,
      },
  );

  try {
    return await loop.run();
  } finally {
    await sandbox.destroy().catch(() => {});
  }
}