/**
 * Execute the agent for a given run. Used by Inngest handler (Node/Vercel in-process).
 * Edge `agent-run` só dispara o evento — não chama mais execute via HTTP.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type AgentJobParams, executeAgentJob } from "./run-job.ts";
import { buildSessionExtensionsPrompt, normalizeIdList } from "../_shared/session-extensions.ts";
import { type AgentPreferencesPayload, loadDeployConnectorKeys } from "./connector-keys.ts";
import type { ProviderConfig } from "./providers.ts";
import {
  loadUserLlmContext,
  resolveAgentProvider,
  resolveEffectiveAgentPreferences,
  resolveExecuteIdList,
  resolveExecuteSessionKindRaw,
  validateAgentPreferences,
} from "./run-setup.ts";
import { buildStackContext, stackPromptAddon } from "../_shared/stack-context.ts";
import { buildChatHistory } from "./memory.ts";
import { RobinKeyPool } from "./robin-pool.ts";
import { loadUserE2bApiKey } from "../_shared/user-e2b.ts";
import { restoreExecutionLogFromRows } from "./executionLogMeta.ts";
import { clearConversationCheckpoint, loadCheckpoint } from "./checkpoint.ts";
import { buildSandboxEnv } from "./sandbox-env.ts";
import { resolveAllocateSandbox } from "./run-context.ts";
import { logger } from "../_shared/logger.ts";
import { appendStreamEvent } from "../_shared/agent-stream.ts";
import { chunkCapErrorMessage, evaluateChunkLimits } from "../_shared/agent-chunk-limits.ts";
import { ensureTerminalRunMessage } from "../_shared/ensure-terminal-message.ts";
import {
  agentRuntimeV2WorkerEnabled,
  resolveJobGenerationForChunk,
  shadowCompleteJob,
  shadowEnqueueNextChunk,
} from "../_shared/agent-jobs.ts";
import { transitionRun } from "../_shared/run-lifecycle.ts";
import type { AgentRunStatus } from "../_shared/agent-contract-lifecycle.ts";

function executorRunMode(planMode: boolean, chatMode: boolean): "plan" | "build" | "chat" {
  if (chatMode) return "chat";
  if (planMode) return "plan";
  return "build";
}

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
  chatMode?: boolean;
  plan?: string;
  planSourceRunId?: string;
  /** Pula gate conversacional no loop (build pós-plano aprovado). */
  skipConversationalGate?: boolean;
};

export type ExecuteResult = {
  ok: boolean;
  runId: string;
  mode: "plan" | "build" | "chat";
  resumable: boolean;
  canceled: boolean;
  error?: string;
  stepsCompleted: number;
  durationMs: number;
  // Session 2.0 — tokens/cost para o finish terminal
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
};

export async function executeAgentRun(
  supabase: SupabaseClient,
  params: ExecuteParams,
): Promise<ExecuteResult> {
  const startMs = Date.now();
  const {
    runId,
    projectId,
    conversationId,
    userId,
    resume: resumeParam,
    planMode,
    chatMode = false,
  } = params;
  const runMode = executorRunMode(planMode, chatMode);

  // Infra-debug: log estruturado do início do executor. Sem isso, o
  // caminho entre Inngest e o AgentLoop é invisível.
  const execStartedAt = Date.now();
  logger.info("agent_run.execute_started", {
    runId,
    projectId,
    conversationId,
    planMode,
    resumeParam,
    hasApprovedPlanSource: !!params.planSourceRunId,
  });

  // Race-safe cancel check: if the user canceled between Inngest's check
  // and this call, exit early without touching state.
  const { data: preCheck } = await supabase
    .from("agent_runs")
    .select("status, canceled_at, meta")
    .eq("id", runId)
    .maybeSingle();
  const runMeta = (preCheck?.meta ?? {}) as Record<string, unknown>;
  const jobGeneration = await resolveJobGenerationForChunk(supabase, runId, {
    planMode,
    chatMode,
    resume: resumeParam,
    planSourceRunId: params.planSourceRunId ?? null,
  });

  if (agentRuntimeV2WorkerEnabled() && jobGeneration == null) {
    const msg = "Worker mode: nenhum agent_job disponível para este chunk";
    await transitionRun(supabase, runId, "failed", { error: msg });
    return {
      ok: false,
      runId,
      mode: runMode,
      resumable: false,
      canceled: false,
      error: msg,
      stepsCompleted: 0,
      durationMs: Date.now() - startMs,
    };
  }

  const effectivePreferences = await resolveEffectiveAgentPreferences(
    supabase,
    userId,
    runMeta,
  );
  const effectiveSessionKindRawEarly = resolveExecuteSessionKindRaw(
    params.sessionKindRaw,
    runMeta,
  );
  if (effectiveSessionKindRawEarly === "byok") {
    const prefError = validateAgentPreferences(effectivePreferences);
    if (prefError) {
      await transitionRun(supabase, runId, "failed", { error: prefError });
      return {
        ok: false,
        runId,
        mode: runMode,
        resumable: false,
        canceled: false,
        error: prefError,
        stepsCompleted: 0,
        durationMs: Date.now() - startMs,
      };
    }
  }
  const effectiveSkillIds = resolveExecuteIdList(
    params.enabledSkillIds,
    runMeta,
    "enabledSkillIds",
  );
  const effectiveMcpIds = resolveExecuteIdList(params.enabledMcpIds, runMeta, "enabledMcpIds");
  const effectiveSessionKindRaw = resolveExecuteSessionKindRaw(params.sessionKindRaw, runMeta);

  if (preCheck?.status === "canceled" || preCheck?.canceled_at) {
    return {
      ok: false,
      runId,
      mode: runMode,
      resumable: false,
      canceled: true,
      error: "Cancelado",
      stepsCompleted: 0,
      durationMs: Date.now() - startMs,
    };
  }
  if (preCheck?.status === "completed" || preCheck?.status === "failed") {
    return {
      ok: true,
      runId,
      mode: runMode,
      resumable: false,
      canceled: false,
      stepsCompleted: 0,
      durationMs: Date.now() - startMs,
    };
  }

  const { data: duplicateRuns } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("project_id", projectId)
    .in("status", ["running", "pending"])
    .neq("id", runId);
  for (const dupe of duplicateRuns ?? []) {
    const dupeId = dupe.id as string;
    await transitionRun(supabase, dupeId, "failed", {
      error: "Run duplicado cancelado — outra execução assumiu.",
      meta: { duplicateCanceled: true },
    });
    await appendStreamEvent(supabase, dupeId, "finish", {
      type: "finish",
      ok: false,
      resumable: false,
      error: "Run duplicado cancelado — outra execução assumiu.",
      duplicate: true,
    });
    logger.warn("agent_run.duplicate_canceled", {
      runId: dupeId,
      activeRunId: runId,
      projectId,
    });
  }

  // Mark running + set full meta (provider, model, etc.)
  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id, template, meta")
    .eq("id", projectId)
    .single();

  if (!project) {
    return {
      ok: false,
      runId,
      mode: runMode,
      resumable: false,
      canceled: false,
      error: "Projeto não encontrado",
      stepsCompleted: 0,
      durationMs: 0,
    };
  }

  // Load history
  const { data: history } = await supabase
    .from("messages")
    .select("role, parts, tool_calls, meta, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(120);
  const historyRows = history ?? [];

  const loadedCheckpoint =
    resumeParam === true ? await loadCheckpoint(supabase, projectId, conversationId) : null;
  if (!resumeParam) {
    await clearConversationCheckpoint(supabase, projectId, conversationId);
  }
  const resumeRun = resumeParam === true && !!loadedCheckpoint;
  const restoredExecutionLog = resumeRun ? restoreExecutionLogFromRows(historyRows) : [];

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
    logger.info("agent_run.provider_resolved", {
      runId,
      sessionKind,
      provider: mainCfg.label,
      model: mainCfg.model,
      baseUrl: mainCfg.baseUrl ?? "(default)",
      llmProvider: mainCfg.provider,
      effectiveRobin,
      tasteStart,
      poolSize: robinPool?.size ?? 0,
      keyNames: Object.keys(connectorKeys),
    });
  } catch (err: unknown) {
    // Infra-debug: loga o erro raw antes de marcar o run como failed.
    logger.error("agent_run.provider_resolve_failed", {
      runId,
      errorMessage: (err as Error)?.message,
      errorName: (err as Error)?.name,
    });
    const msg = (err as Error)?.message ?? "Provider LLM não configurado";
    await transitionRun(supabase, runId, "failed", { error: msg });
    return {
      ok: false,
      runId,
      mode: runMode,
      resumable: false,
      canceled: false,
      error: msg,
      stepsCompleted: 0,
      durationMs: Date.now() - startMs,
    };
  }

  const messages = await buildChatHistory(historyRows, 120, mainCfg.model);

  // Allocate sandbox decision — short-circuit approved (and prior plan_approved in history for follow-ups)
  // BEFORE any lastUserContent extraction / looksLike (meta-aware + approve-proof).
  const isApprovedPlanBuild = !!(runMeta.planSourceRunId ?? params.planSourceRunId);
  const hasApprovedPlanInHistory = historyRows.some((r: any) => {
    const meta = (r?.meta ?? {}) as Record<string, unknown>;
    return (
      r?.role === "user" &&
      (meta.kind === "plan_approved" || typeof meta.planSourceRunId === "string")
    );
  });
  const lastUserContent = (() => {
    const lastUser = [...historyRows].reverse().find((m: any) => m.role === "user");
    const parts = lastUser?.parts || [];
    const textPart = parts.find((p: any) => p?.type === "text" || typeof p?.text === "string");
    return textPart?.text || textPart?.content || "";
  })();
  const projectHasSandbox = !!(
    ((project as any).meta || {})?.previewSandboxId || ((project as any).meta || {})?.previewReady
  );
  const allocateSandboxLocal = resolveAllocateSandbox({
    planMode,
    chatMode,
    userContent: lastUserContent,
    projectHasSandbox,
    hasApprovedPlanInHistory,
    isApprovedPlanBuild,
  });
  logger.info("agent_run.sandbox_decision", {
    runId,
    planMode,
    allocateSandbox: allocateSandboxLocal,
    projectHasSandbox,
    isApprovedPlanBuild,
  });

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
  await transitionRun(supabase, runId, "running", {
    meta: {
      ...currentMeta,
      ...runMetaBase,
      betweenChunks: false,
      plan: params.plan ?? currentMeta.plan ?? null,
      planSourceRunId: params.planSourceRunId ?? currentMeta.planSourceRunId ?? null,
    },
  });

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
    chatMode,
    allocateSandbox: allocateSandboxLocal,
    skipConversationalGate:
      isApprovedPlanBuild || hasApprovedPlanInHistory || params.skipConversationalGate === true,
  };

  const onEvent = (type: string, data: Record<string, unknown>) => {
    void appendStreamEvent(supabase, runId, type, { type, ...data });
  };

  // Inngest executa o loop in-process; resume só se o budget do step expirar.
  let result: Awaited<ReturnType<typeof executeAgentJob>>;
  try {
    result = await executeAgentJob(supabase, { ...jobParams, resumeRun }, onEvent);
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? "Agent execution failed";
    await transitionRun(supabase, runId, "failed", { error: msg });
    return {
      ok: false,
      runId,
      mode: runMode,
      resumable: false,
      canceled: false,
      error: msg,
      stepsCompleted: 0,
      durationMs: Date.now() - startMs,
    };
  }

  const { data: finalRun } = await supabase
    .from("agent_runs")
    .select("status, meta, started_at")
    .eq("id", runId)
    .maybeSingle();
  const finalStatus = finalRun?.status as string | undefined;
  const finalMeta = (finalRun?.meta ?? {}) as Record<string, unknown>;
  const awaitingStates = ["awaiting_user"];
  const isAwaiting =
    awaitingStates.includes(finalStatus ?? "") ||
    !!finalMeta.awaitingUser ||
    result.awaiting === true;
  const prevMeta = (finalRun?.meta ?? runMetaBase) as Record<string, unknown>;

  // Chunk resumable: Inngest chama execute de novo — não finalizar a run.
  if (!result.ok && result.resumable && !result.canceled && !isAwaiting) {
    const chunkLimits = evaluateChunkLimits(
      prevMeta,
      finalRun?.started_at as string | undefined,
      Date.now(),
      { buildFix: result.buildFix === true || prevMeta.buildFix === true },
    );

    if (chunkLimits.exceeded) {
      const capError = chunkCapErrorMessage(chunkLimits.reason);
      await transitionRun(supabase, runId, "failed", {
        steps: result.steps,
        error: capError,
        heartbeat_at: new Date().toISOString(),
        meta: {
          ...prevMeta,
          chunkGeneration: chunkLimits.chunkGeneration,
          chunkCapExceeded: true,
          chunkCapReason: chunkLimits.reason ?? null,
        },
      });

      await appendStreamEvent(supabase, runId, "finish", {
        type: "finish",
        ok: false,
        resumable: false,
        error: capError,
        chunkCap: true,
        resumableExhausted: true,
        resumeAttempts: chunkLimits.chunkGeneration,
        steps: result.steps,
      });

      await ensureTerminalRunMessage(supabase, {
        runId,
        conversationId,
        projectId,
        error: capError,
        buildFailed: !planMode,
      });

      logger.warn("agent_run.chunk_cap_exceeded", {
        runId,
        reason: chunkLimits.reason,
        chunkGeneration: chunkLimits.chunkGeneration,
        mode: runMode,
      });

      return {
        ok: false,
        runId,
        mode: runMode,
        resumable: false,
        canceled: false,
        error: capError,
        stepsCompleted: result.steps,
        durationMs: Date.now() - startMs,
      };
    }

    await transitionRun(supabase, runId, "running", {
      steps: result.steps,
      error: null,
      heartbeat_at: new Date().toISOString(),
      meta: {
        ...prevMeta,
        chunkGeneration: chunkLimits.chunkGeneration,
        ...(chunkLimits.buildFixAttempts != null
          ? { buildFixAttempts: chunkLimits.buildFixAttempts }
          : {}),
        buildFix: result.buildFix === true || prevMeta.buildFix === true,
        lastChunkAt: new Date().toISOString(),
        lastChunkMessage: result.error ?? null,
        betweenChunks: true,
      },
    });

    // Session 2.0 — sinaliza retomada de chunk ao consumidor (antes só em meta).
    await appendStreamEvent(supabase, runId, "chunk_resume", {
      type: "chunk_resume",
      attempt: chunkLimits.chunkGeneration,
      maxAttempts: 12,
      reason: result.error ?? "step budget exceeded",
    });

    await shadowCompleteJob(supabase, runId, jobGeneration, {
      resumable: true,
      steps: result.steps,
      error: result.error ?? null,
      chunkGeneration: chunkLimits.chunkGeneration,
    }, false);
    await shadowEnqueueNextChunk(supabase, runId, chunkLimits.chunkGeneration + 1, {
      planMode,
      resume: true,
    });

    logger.info("agent_run.chunk_resumable", {
      runId,
      mode: runMode,
      steps: result.steps,
      chunkGeneration: chunkLimits.chunkGeneration,
      durationMs: Date.now() - startMs,
    });

    return {
      ok: false,
      runId,
      mode: runMode,
      resumable: true,
      canceled: false,
      error: result.error,
      stepsCompleted: result.steps,
      durationMs: Date.now() - startMs,
    };
  }

  let terminalStatus: AgentRunStatus;
  if (result.canceled) {
    terminalStatus = "canceled";
  } else if (isAwaiting) {
    terminalStatus = (finalStatus as AgentRunStatus) ?? "awaiting_user";
  } else if (result.ok) {
    terminalStatus = "completed";
  } else {
    terminalStatus = "failed";
  }

  await transitionRun(supabase, runId, terminalStatus, {
    steps: result.steps,
    error: result.error ?? null,
    heartbeat_at: new Date().toISOString(),
    ...(result.canceled ? { canceled_at: new Date().toISOString() } : {}),
    meta: {
      ...prevMeta,
      ...(result.summary ? { summary: result.summary } : {}),
      ...(result.toolsUsed?.length ? { toolsUsed: result.toolsUsed } : {}),
      ...(result.awaitingUser ? { awaitingUser: result.awaitingUser } : {}),
      ...(result.plan ? { plan: result.plan } : {}),
    },
  });

  await appendStreamEvent(supabase, runId, "finish", {
    type: "finish",
    ok: result.ok,
    canceled: result.canceled,
    resumable: false,
    error: result.error ?? null,
    awaiting: isAwaiting,
    steps: result.steps,
    summary: result.summary ?? null,
    // Session 2.0 — tokens/cost propagados do loop.run()
    totalInputTokens: result.totalInputTokens ?? undefined,
    totalOutputTokens: result.totalOutputTokens ?? undefined,
    totalTokens: result.totalTokens ?? undefined,
    costUsd: result.costUsd ?? undefined,
  });

  if (!result.ok && !result.canceled && !isAwaiting) {
    await ensureTerminalRunMessage(supabase, {
      runId,
      conversationId,
      projectId,
      error: result.error ?? null,
      summary: result.summary ?? null,
      buildFailed: !planMode,
    });
  }

  await shadowCompleteJob(
    supabase,
    runId,
    jobGeneration,
    {
      ok: result.ok,
      canceled: result.canceled,
      steps: result.steps,
      error: result.error ?? null,
      awaiting: isAwaiting,
    },
    result.ok && !result.canceled,
  );

  logger.info("agent_run.executed", {
    runId,
    mode: runMode,
    ok: result.ok,
    resumable: result.resumable,
    canceled: result.canceled,
    durationMs: Date.now() - startMs,
  });

  return {
    ok: result.ok,
    runId,
    mode: runMode,
    resumable: !!result.resumable,
    canceled: !!result.canceled,
    error: result.error,
    stepsCompleted: result.steps,
    durationMs: Date.now() - startMs,
    totalInputTokens: result.totalInputTokens,
    totalOutputTokens: result.totalOutputTokens,
    totalTokens: result.totalTokens,
    costUsd: result.costUsd,
  };
}
