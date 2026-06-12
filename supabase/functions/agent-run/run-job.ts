/**
 * Núcleo de execução do agent loop — chamado pelo handler Inngest (Node in-process).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ToolRegistry } from "./registry.ts";
import { registerMetaTools } from "./tools/meta.ts";
import { AgentLoop } from "./loop.ts";
import { createSandboxProvider } from "./sandbox.ts";
import { registerFsTools } from "./tools/fs.ts";
import { registerShellTool } from "./tools/shell.ts";
import { type AgentState, LoopPhase } from "./types.ts";
import { type AgentPreferencesPayload, loadDeployConnectorKeys } from "./connector-keys.ts";
import type { ProviderConfig } from "./providers.ts";
import { loadUserLlmContext, resolveAgentProvider } from "./run-setup.ts";
import { buildStackContext, stackPromptAddon } from "../_shared/stack-context.ts";
import { buildChatHistory } from "./memory.ts";
import { ResilientLLM, RobinKeyPool } from "./robin-pool.ts";
import { loadUserE2bApiKey } from "../_shared/user-e2b.ts";
import { buildSessionExtensionsPrompt, normalizeIdList } from "../_shared/session-extensions.ts";
import { registerMcpForgeTools } from "./tools/mcp-forge.ts";
import { registerDeployTool } from "./tools/deploy.ts";
import { restoreExecutionLogFromRows } from "./executionLogMeta.ts";
import { loadCheckpoint } from "./checkpoint.ts";
import { buildSandboxEnv } from "./sandbox-env.ts";
import { PLAN_APPROVED_PREFIX } from "./qualify.ts";
import type { ChatMessage, PlanStep } from "./types.ts";

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
  /**
   * Se false: caminho leve (clarify/conversa) — sem E2B nem shell tool.
   * Default true para compatibilidade.
   */
  allocateSandbox?: boolean;
  /** Pula gate conversacional no loop (build pós-plano aprovado). */
  skipConversationalGate?: boolean;
};

/**
 * Quando uma build run é disparada via plan-decide:planApprove, o run.meta
 * traz `planSummary` (texto curto) e `steps` (passos aprovados). Para que o
 * LLM entenda o contexto sem re-classificar do zero, injetamos UMA mensagem
 * sintética no final do histórico:
 *
 *   [Plano aprovado] Segue o plano abaixo.
 *
 *   <planSummary>
 *
 *   1. <step 1 description> (filePath)
 *   2. <step 2 description> (filePath)
 *   ...
 *
 *   Execute os passos acima na ordem indicada.
 *
 * A mensagem é marcada com o prefixo [Plano aprovado] — `extractOriginalUserRequest`
 * (qualify.ts) a ignora ao buscar o pedido original do usuário, evitando que
 * essa mensagem sintética seja confundida com a requisição real.
 */
function injectPlanApprovalMessage(
  baseMessages: ChatMessage[],
  meta: Record<string, unknown>,
  planMode: boolean,
): ChatMessage[] {
  if (planMode) return baseMessages;
  const planSummary = typeof meta.planSummary === "string" ? meta.planSummary.trim() : "";
  const steps = Array.isArray(meta.steps) ? (meta.steps as unknown[]) : [];
  if (!planSummary && steps.length === 0) return baseMessages;

  const stepsList = steps
    .map((s, i) => {
      const step = (s ?? {}) as Record<string, unknown>;
      const desc = String(step.description ?? "").trim();
      const filePath = typeof step.filePath === "string" ? step.filePath : "";
      if (!desc) return null;
      return `${i + 1}. ${desc}${filePath ? ` (${filePath})` : ""}`;
    })
    .filter((line): line is string => line !== null)
    .join("\n");

  const planBlock = planSummary ? `${planSummary}\n\n` : "";
  const stepsBlock = stepsList ? `${stepsList}\n\n` : "";
  const content = [
    `${PLAN_APPROVED_PREFIX} Segue o plano abaixo.`,
    "",
    `${planBlock}${stepsBlock}Execute os passos acima na ordem indicada.`,
  ]
    .join("\n")
    .trim();

  const injected: ChatMessage = {
    role: "user",
    content,
    meta: {
      kind: "plan_approved",
      planSourceRunId: typeof meta.planSourceRunId === "string" ? meta.planSourceRunId : undefined,
    },
  };
  return [...baseMessages, injected];
}

function coercePlanStepsFromMeta(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: PlanStep[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    const description = typeof r.description === "string" ? r.description.trim() : "";
    if (!description) continue;
    steps.push({
      id: typeof r.id === "string" && r.id ? r.id : `s${i + 1}`,
      type: typeof r.type === "string" ? (r.type as PlanStep["type"]) : "custom",
      description,
      filePath: typeof r.filePath === "string" ? r.filePath : undefined,
      estimatedCost: typeof r.estimatedCost === "number" ? r.estimatedCost : 0.002,
      enabled: r.enabled !== false,
    });
  }
  return steps;
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
    projectId,
    conversationId,
    userId,
    agentRunId,
    resumeRun,
    preferences,
    sessionKindRaw,
    enabledSkillIds,
    enabledMcpIds,
    planMode = false,
    skipConversationalGate = false,
  } = params;

  // Fast cancel check (covers both inline fallback in agent-run and worker chunks)
  const { data: pre } = await supabase
    .from("agent_runs")
    .select("canceled_at, status, meta")
    .eq("id", agentRunId)
    .maybeSingle();
  if (pre?.canceled_at || pre?.status === "canceled") {
    return { ok: false, error: "Cancelado", steps: 0, canceled: true };
  }
  const preMeta = (pre?.meta ?? {}) as Record<string, unknown>;

  // Paraleliza queries independentes de inicialização (reduz cold-start)
  const [projectResult, profileResult, historyResult, userLlmResult] = await Promise.all([
    supabase.from("projects").select("id, owner_id, template, meta").eq("id", projectId).single(),
    supabase.from("profiles").select("integration_prefs").eq("id", userId).maybeSingle(),
    supabase
      .from("messages")
      .select("role, parts, tool_calls, meta, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(120),
    loadUserLlmContext(supabase, userId, preferences),
  ]);

  const { data: project } = projectResult;
  if (!project || project.owner_id !== userId) {
    throw new Error("Projeto não encontrado");
  }

  const { data: profile } = profileResult;
  const { data: history } = historyResult;
  const { userOnlyKeys } = userLlmResult;

  const historyRows = history ?? [];
  const restoredExecutionLog = resumeRun ? restoreExecutionLogFromRows(historyRows) : [];
  const loadedCheckpoint = resumeRun
    ? await loadCheckpoint(supabase, projectId, conversationId)
    : null;

  type SessionKind = "taste_start" | "byok";
  let sessionKind: SessionKind = "byok";
  if (sessionKindRaw === "taste_start") sessionKind = "taste_start";
  if (sessionKindRaw === "taste") sessionKind = "taste_start";

  const { mainCfg, connectorKeys, robinPool, effectiveRobin, tasteStart } =
    await resolveAgentProvider({
      supabase,
      userId,
      preferences,
      sessionKind,
      userOnlyKeys,
    });

  const messages = await buildChatHistory(historyRows, 120, mainCfg.model);
  const sessionExt = await buildSessionExtensionsPrompt(enabledSkillIds, enabledMcpIds);

  // Plan mode precisa de sandbox para shell_exec exploratório (grep, cat, ls…).
  let allocateSandbox = params.allocateSandbox !== false;
  const isPlanApprovedBuild = !planMode && !!preMeta.planSourceRunId;
  if (isPlanApprovedBuild) {
    allocateSandbox = true; // force for approved builds + follow-ups (meta-aware contract)
  }

  const reg = new ToolRegistry();
  registerMetaTools(reg, { planMode });
  const projectTemplate = (project as { template?: string }).template ?? "vite-react";
  const projectMeta = ((project as { meta?: Record<string, unknown> }).meta ?? {}) as Record<
    string,
    unknown
  >;
  const deployKeys = await loadDeployConnectorKeys(supabase, userId);
  const stackCtx = buildStackContext(profile?.integration_prefs, projectMeta, {
    ...connectorKeys,
    ...deployKeys,
  });
  const stackAddon = stackPromptAddon(stackCtx);

  registerFsTools(reg, {
    supabase,
    projectId,
    userId,
    runId: agentRunId,
    stackKind: projectTemplate,
  });

  // CRÍTICO para o "caminho barato primeiro":
  // Só aloca E2B/sandbox (e registra shell) quando realmente vamos construir.
  // Qualify/conversa pura NUNCA deve carregar chave nem criar container.
  let sandbox: { destroy: () => Promise<void>; kill: () => Promise<void> };
  if (allocateSandbox) {
    const e2bKey = await loadUserE2bApiKey(supabase, userId);
    if (!e2bKey?.trim()) throw new Error("Sandbox E2B não configurado");
    const realSandbox = createSandboxProvider(e2bKey, undefined, supabase, projectId);
    sandbox = realSandbox;
    registerShellTool(reg, {
      sandbox: realSandbox,
      projectId,
      supabase,
      sandboxEnv: buildSandboxEnv(connectorKeys, deployKeys),
    });
  } else {
    // Dummy para finally e para o caso de o loop ser chamado em modo conversa (deve early-return antes de tools).
    sandbox = { destroy: async () => {}, kill: async () => {} };
    // Não registramos shell tool. Qualify não usa ferramentas de FS/shell.
  }

  registerMcpForgeTools(reg, {
    supabase,
    projectId,
    userId,
    enabledMcpIds,
    deployKeys,
    context7ApiKey: Deno.env.get("CONTEXT7_API_KEY") ?? undefined,
  });
  const deployTokenKey =
    stackCtx.deployTarget === "vercel"
      ? "VERCEL_TOKEN"
      : stackCtx.deployTarget === "netlify"
        ? "NETLIFY_TOKEN"
        : stackCtx.deployTarget === "cloudflare"
          ? "CLOUDFLARE_API_TOKEN"
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
      projectId,
      conversationId,
      userId,
      messages: injectPlanApprovalMessage([...messages], preMeta, planMode),
      phase: LoopPhase.GATHER_CONTEXT,
      currentStepIndex: 0,
      context: null,
      intent: null,
      plan: null,
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
      ? {
          resolvedMainCfg: mainCfg,
          preferences,
          maxSteps: 14,
          tasteStart: true,
          sessionAddon: sessionExt.addon,
          userSkillNames: sessionExt.skillNames,
          runId: agentRunId,
          planMode,
        }
      : {
          resolvedMainCfg: mainCfg,
          preferences,
          sessionAddon: sessionExt.addon,
          userSkillNames: sessionExt.skillNames,
          resumeRun,
          hasCheckpoint: !!loadedCheckpoint,
          resumePhase: loadedCheckpoint?.phase ?? null,
          complexityScore: loadedCheckpoint?.extra.complexityScore,
          maxStepsFromCheckpoint: loadedCheckpoint?.extra.maxStepsLimit,
          runId: agentRunId,
          planMode,
          approvedPlanBuild: isPlanApprovedBuild,
          skipConversationalGate: skipConversationalGate || isPlanApprovedBuild,
          planSummary:
            typeof preMeta.planDocument === "string"
              ? preMeta.planDocument
              : typeof preMeta.planSummary === "string"
                ? preMeta.planSummary
                : undefined,
          planHeadline: typeof preMeta.planHeadline === "string" ? preMeta.planHeadline : undefined,
          planSteps: coercePlanStepsFromMeta(preMeta.steps),
          buildFixResume: preMeta.buildFix === true,
        },
  );

  let result: {
    ok: boolean;
    summary?: string;
    error?: string;
    steps: number;
    resumable?: boolean;
    buildFix?: boolean;
    canceled?: boolean;
    toolsUsed?: string[];
  };
  try {
    result = await loop.run();
  } catch (e) {
    await sandbox.kill().catch(() => {});
    throw e;
  }
  // Só mata sandbox se falhou ou não produziu nada.
  // Se criou/alterou arquivos, mantém vivo para preview.
  const hasOutput = (result.toolsUsed ?? []).some((t) =>
    ["fs_write", "fs_edit", "shell_exec"].includes(t),
  );
  if (!result.ok || !hasOutput) {
    await sandbox.kill().catch(() => {});
  } else {
    await sandbox.destroy().catch(() => {});
  }
  return result;
}
