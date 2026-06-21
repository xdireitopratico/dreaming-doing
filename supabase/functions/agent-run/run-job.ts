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
import { registerWebTools } from "./tools/web.ts";
import { registerExtractTools } from "./tools/extract.ts";
import { restoreExecutionLogFromRows } from "./executionLogMeta.ts";
import { loadCheckpoint } from "./checkpoint.ts";
import { buildSandboxEnv } from "./sandbox-env.ts";
import { PLAN_APPROVED_PREFIX } from "./run-context.ts";
import type { ChatMessage, PlanStep } from "./types.ts";
import { logger } from "../_shared/logger.ts";

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
 * (run-context.ts) a ignora ao buscar o pedido original do usuário, evitando que
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

  // Extrai direção de design do plano aprovado (se houver)
  const designBlock = buildDesignDirectiveBlock(meta.design);

  const content = [
    `${PLAN_APPROVED_PREFIX} Segue o plano abaixo.`,
    "",
    `${planBlock}${stepsBlock}${designBlock}Execute os passos acima na ordem indicada.`,
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

function buildDesignDirectiveBlock(designRaw: unknown): string {
  if (!designRaw || typeof designRaw !== "object") return "";
  const d = designRaw as Record<string, unknown>;
  const voice = Array.isArray(d.voice) ? (d.voice as string[]).join(" + ") : "";
  const moment = typeof d.moment === "string" ? d.moment : "";
  const techniques = Array.isArray(d.techniques) ? (d.techniques as string[]).join(", ") : "";
  const mood = typeof d.mood === "string" ? d.mood : "";
  const reasoning = typeof d.synthesis_reasoning === "string" ? d.synthesis_reasoning : "";
  const antiPatterns = Array.isArray(d.anti_patterns) ? (d.anti_patterns as string[]) : [];
  const references = Array.isArray(d.references) ? (d.references as Record<string, unknown>[]) : [];

  if (!voice && !moment) return "";

  const lines: string[] = ["", "---", "## DIREÇÃO DE DESIGN APROVADA", ""];

  if (voice) lines.push(`**Voice:** ${voice}`);
  if (mood) lines.push(`**Mood:** ${mood}`);
  if (moment) lines.push(`**Momento-memorável:** ${moment}`);
  if (techniques) lines.push(`**Técnicas:** ${techniques}`);
  if (reasoning) lines.push(`**Reasoning:** ${reasoning}`);

  if (references.length > 0) {
    lines.push("", "**Referências visuais:**");
    for (const ref of references) {
      const url = typeof ref.url === "string" ? ref.url : "";
      const title = typeof ref.title === "string" ? ref.title : url;
      if (url) lines.push(`- ${title} — ${url}`);
    }
  }

  if (antiPatterns.length > 0) {
    lines.push("", "**Anti-padrões a evitar:**");
    for (const ap of antiPatterns) lines.push(`- ${ap}`);
  }

  lines.push(
    "",
    "Siga esta direção ao construir. Não improvise — execute a síntese aprovada.",
    "---",
    "",
  );

  return lines.join("\n");
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

  // Infra-debug: log estruturado do início do job — sem isso, qualquer
  // falha em run-job.ts é invisível (não havia logger aqui).
  const jobStartedAt = Date.now();
  logger.info("agent.run_job_started", {
    runId: agentRunId ?? undefined,
    projectId,
    conversationId,
    planMode,
    resumeRun,
    enabledSkillCount: enabledSkillIds?.length ?? 0,
    enabledMcpCount: enabledMcpIds?.length ?? 0,
    skipConversationalGate,
  });

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

  // Plan: shell só se sandbox já existe (reuso). Build: pode criar sandbox novo.
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
    const realSandbox = createSandboxProvider(e2bKey, undefined, supabase, projectId, {
      allowCreate: !planMode,
    });
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

  registerWebTools(reg, {
    supabase,
    userId,
    connectorKeys,
  });

  // extract_design_dna — sandbox exec URL só no Build mode (sandbox ativo)
  const sandboxExecUrl = allocateSandbox
    ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/prometheus-tool-executor`
    : undefined;
  registerExtractTools(reg, {
    supabase,
    userId,
    projectId,
    sandboxExecUrl,
    sandboxToken: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? undefined,
    connectorKeys,
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
          planDesign: preMeta.design
            ? (() => {
                const d = preMeta.design as Record<string, unknown>;
                return {
                  references: Array.isArray(d.references) ? d.references : [],
                };
              })()
            : undefined,
          buildFixResume: preMeta.buildFix === true,
          chunkGeneration:
            typeof preMeta.chunkGeneration === "number" ? preMeta.chunkGeneration : 0,
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
  loop.startHeartbeatTimer(30_000); // H8: 90s → 30s (observe() pode demorar 2-5min)
  try {
    result = await loop.run();
  } catch (e) {
    await sandbox.kill().catch(() => {});
    throw e;
  } finally {
    loop.stopHeartbeatTimer();
  }
  // C2 fix: NÃO mata sandbox se a run é resumable. Antes, o caminho
  // resumable (loop budget estourou) matava o sandbox, e o próximo
  // chunk tinha que recriar do zero (perdendo node_modules, npm install
  // de novo = 60-120s).
  // Agora: só mata se a run terminou definitivamente (ok ou fail/canceled).
  const hasOutput = (result.toolsUsed ?? []).some((t) =>
    ["fs_write", "fs_edit", "shell_exec"].includes(t),
  );
  const isResumable = !!result.resumable;
  if (isResumable) {
    // Preserva sandbox para o próximo chunk.
    await sandbox.destroy().catch(() => {}); // libera in-memory ref mas mantém o sandbox E2B
  } else if (!result.ok || !hasOutput) {
    await sandbox.kill().catch(() => {});
  } else {
    await sandbox.destroy().catch(() => {});
  }
  // Infra-debug: log de fim do job. Cobre o caminho "feliz" e o "fim com
  // erro do loop" (canceled, resumable, failed). Soma com agent.run_job_threw
  // dá o quadro completo.
  logger.info("agent.run_job_finished", {
    runId: agentRunId ?? undefined,
    durationMs: Date.now() - jobStartedAt,
    ok: result.ok,
    steps: result.steps,
    resumable: !!result.resumable,
    canceled: !!result.canceled,
    buildFix: !!result.buildFix,
    error: result.error?.slice(0, 200),
    toolsUsedCount: result.toolsUsed?.length ?? 0,
  });
  return result;
}
