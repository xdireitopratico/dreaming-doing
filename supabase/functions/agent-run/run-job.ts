/**
 * Núcleo de execução do agent loop — chamado pelo handler Inngest (Node in-process).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ToolRegistry } from "./registry.ts";
import { registerMetaTools } from "./tools/meta.ts";
import { createAgentRuntime } from "./runtime/agent-runtime.ts";
import { createSandboxProvider } from "./sandbox.ts";
import { registerFsTools } from "./tools/fs.ts";
import { registerShellTool } from "./tools/shell.ts";
import { type AgentState, LoopPhase } from "./types.ts";
import { type AgentPreferencesPayload, loadDeployConnectorKeys } from "./connector-keys.ts";
import type { ProviderConfig } from "./providers.ts";
import {
  loadUserLlmContext,
  resolveAgentProvider,
  resolveEffectiveAgentPreferences,
} from "./run-setup.ts";
import { buildStackContext, stackPromptAddon } from "../_shared/stack-context.ts";
import { buildChatHistory } from "./memory.ts";
import { ResilientLLM, RobinKeyPool } from "./robin-pool.ts";
import { loadUserE2bApiKey } from "../_shared/user-e2b.ts";
import { buildSessionExtensionsPrompt, normalizeIdList } from "../_shared/session-extensions.ts";
import { registerMcpForgeTools } from "./tools/mcp-forge.ts";
import { registerDeployTool } from "./tools/deploy.ts";
import { registerWebTools } from "./tools/web.ts";
import { registerExtractTools } from "./tools/extract.ts";
import { registerDesignTools } from "./tools/design.ts";
import { registerSkillsTools } from "./tools/skills.ts";
import { restoreExecutionLogFromRows } from "./executionLogMeta.ts";
import { loadCheckpoint } from "./checkpoint.ts";
import { buildSandboxEnv } from "./sandbox-env.ts";
import { buildDesignDirectiveBlock } from "./design-directive.ts";
import {
  autoResolveDesignField,
  excludesFromSignature,
  isWebUiTemplate,
  type DesignSignatureRecord,
} from "./design-plan-field.ts";
import { PLAN_APPROVED_PREFIX } from "./run-context.ts";
import type { ChatMessage, DesignPlanField, PlanStep } from "./types.ts";
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
  /** Modo Chat: um turno LLM, sem tools nem sandbox. */
  chatMode?: boolean;
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

function coerceDesignPlanField(raw: unknown): DesignPlanField | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  const voice = Array.isArray(d.voice)
    ? (d.voice as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const moment = typeof d.moment === "string" ? d.moment.trim() : "";
  const techniques = Array.isArray(d.techniques)
    ? (d.techniques as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  if (!voice.length || !moment) return undefined;
  return {
    voice,
    moment,
    techniques,
    mood: typeof d.mood === "string" ? d.mood : undefined,
    compositions: Array.isArray(d.compositions)
      ? (d.compositions as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    composition_exports: Array.isArray(d.composition_exports)
      ? (d.composition_exports as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    relevant_dnas: Array.isArray(d.relevant_dnas)
      ? (d.relevant_dnas as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    read_paths: Array.isArray(d.read_paths)
      ? (d.read_paths as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    anti_patterns: Array.isArray(d.anti_patterns)
      ? (d.anti_patterns as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    synthesis_reasoning: typeof d.synthesis_reasoning === "string" ? d.synthesis_reasoning : undefined,
  };
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
  buildFix?: boolean;
  canceled?: boolean;
  toolsUsed?: string[];
  awaiting?: boolean;
  awaitingUser?: Record<string, unknown>;
  plan?: unknown;
  // Session 2.0 — tokens/cost propagados do loop.run() para o finish terminal
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
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
    chatMode = false,
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
    chatMode,
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
  const isSmokeRun = preMeta.smoke === true;

  const effectivePreferences = await resolveEffectiveAgentPreferences(
    supabase,
    userId,
    preMeta,
  );

  // Paraleliza queries independentes de inicialização (reduz cold-start)
  const [projectResult, profileResult, historyResult, userLlmResult, siblingSigResult] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, owner_id, template, meta, design_signature")
        .eq("id", projectId)
        .single(),
      supabase.from("profiles").select("integration_prefs").eq("id", userId).maybeSingle(),
      supabase
        .from("messages")
        .select("role, parts, tool_calls, meta, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(120),
      loadUserLlmContext(supabase, userId, effectivePreferences),
      // Assinaturas de design de projetos irmãos — alimenta o check de unicidade (anti-repetição).
      supabase
        .from("projects")
        .select("design_signature")
        .eq("owner_id", userId)
        .neq("id", projectId)
        .not("design_signature", "is", null)
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);

  const { data: project } = projectResult;
  if (!project || project.owner_id !== userId) {
    throw new Error("Projeto não encontrado");
  }

  const { data: profile } = profileResult;
  const { data: history } = historyResult;
  const { userOnlyKeys } = userLlmResult;

  const historyRows = history ?? [];
  // Assinaturas de design dos projetos irmãos do owner (max 20). Cast seguro: rows já filtradas
  // por `not is null`; descarta qualquer valor não-objeto remanescente (JSON antigo/migrado).
  const siblingSigs = (siblingSigResult.data ?? []) as Array<{ design_signature: unknown }>;
  const designHistory: DesignSignatureRecord[] = siblingSigs
    .map((r) => r.design_signature)
    .filter((s): s is DesignSignatureRecord => !!s && typeof s === "object");
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
      preferences: effectivePreferences,
      sessionKind,
      userOnlyKeys,
    });

  const messages = await buildChatHistory(historyRows, 120, mainCfg.model);
  const sessionExt = await buildSessionExtensionsPrompt(enabledSkillIds, enabledMcpIds);

  // Chat: nunca aloca sandbox. Plan: shell só se sandbox já existe. Build: pode criar.
  let allocateSandbox = chatMode ? false : params.allocateSandbox !== false;
  const isPlanApprovedBuild = !planMode && !!preMeta.planSourceRunId;
  if (isPlanApprovedBuild) {
    allocateSandbox = true; // force for approved builds + follow-ups (meta-aware contract)
  }

  const reg = new ToolRegistry();
  registerMetaTools(reg, { planMode });
  registerDesignTools(reg);
  registerSkillsTools(reg);
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
    // P4 fix: rejeitar allocateSandbox sem files ANTES de criar classe
    // E2BSandbox. Antes: shellExecTool era registrado e o erro
    // "Nenhum arquivo no projeto" só aparecia quando o LLM tentava
    // shell_exec pela primeira vez (lazy). Agora: falha explícita
    // no agent-run com mensagem clara.
    const { count: fileCountBeforeAlloc } = await supabase
      .from("project_files")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    if (!fileCountBeforeAlloc || fileCountBeforeAlloc === 0) {
      throw new Error(
        "Projeto sem arquivos — o agente ainda não gerou código. " +
          "Sandbox não pode ser alocado.",
      );
    }
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
    preferences,
  });

  // extract_design_dna — shallow no Plan; deep no Build com sandbox
  const sandboxExecUrl = allocateSandbox
    ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/prometheus-tool-executor`
    : undefined;
  registerExtractTools(reg, {
    supabase,
    userId,
    projectId,
    planMode,
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

  function lastUserRequestText(msgs: ChatMessage[]): string {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role !== "user") continue;
      if (typeof m.content === "string" && m.content.trim()) return m.content.trim();
      if (Array.isArray(m.content)) {
        const text = m.content
          .filter((b) => b.type === "text" && b.text)
          .map((b) => b.text)
          .join("\n")
          .trim();
        if (text) return text;
      }
    }
    return "";
  }

  let approvedPlanDesign = coerceDesignPlanField(preMeta.design);
  if (
    !isSmokeRun &&
    !planMode &&
    !chatMode &&
    !approvedPlanDesign &&
    isWebUiTemplate(projectTemplate)
  ) {
    const sig = (project as { design_signature?: DesignSignatureRecord | null }).design_signature;
    const { excludeVoices, excludeTechniques } = excludesFromSignature(
      sig && typeof sig === "object" ? sig : null,
    );
    const domain =
      (typeof preMeta.planSummary === "string" && preMeta.planSummary.trim()) ||
      lastUserRequestText(messages) ||
      "produto digital";
    approvedPlanDesign = autoResolveDesignField({
      domain,
      projectTemplate,
      rotationKey: projectId,
      excludeVoices,
      excludeTechniques,
    });
  }

  const runtime = createAgentRuntime({
    reg,
    llm: resilientMain,
    supabase,
    state: buildState(),
    onStream: (event) => onEvent(event.type, event.data as Record<string, unknown>),
    injectedKeys: connectorKeys,
    routerOverrides: { main: resilientMain, cheap: resilientMain },
    robinActive: effectiveRobin,
    projectTemplate,
    stackAddon,
    options: tasteStart
      ? {
          resolvedMainCfg: mainCfg,
          preferences,
          maxSteps: 14,
          tasteStart: true,
          sessionAddon: sessionExt.addon,
          userSkillNames: sessionExt.skillNames,
          runId: agentRunId,
          planMode,
          chatMode,
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
          chatMode,
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
          approvedPlanDesign,
          designHistory,
          buildFixResume: preMeta.buildFix === true,
          smokeRun: isSmokeRun,
        },
  });

  let result: {
    ok: boolean;
    summary?: string;
    error?: string;
    steps: number;
    resumable?: boolean;
    buildFix?: boolean;
    canceled?: boolean;
    toolsUsed?: string[];
    awaiting?: boolean;
    awaitingUser?: Record<string, unknown>;
    plan?: unknown;
    totalInputTokens?: number;
    totalOutputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  };
  try {
    result = await runtime.run(30_000); // H8: heartbeat 30s durante observe() longo
  } catch (e) {
    await sandbox.kill().catch(() => {});
    throw e;
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
