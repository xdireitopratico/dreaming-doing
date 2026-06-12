// loop.ts — AgentLoop definitivo.
// Compression, Parallel Exec, Runtime Observer, Skills,
// persistência incremental de tool_calls (cada step vira uma message viva no chat).
// FSM integrada para validação de transições de estado (FORGE 2.0).
import type {
  AgentState,
  ChatMessage,
  ChatResponse,
  FileEntry,
  IntentAnalysis,
  LLMProvider,
  PlanStep,
  ProposedPlan,
  ToolDefinition,
} from "./types.ts";
import { LoopPhase } from "./types.ts";

type RouterOverrides = { main?: LLMProvider; cheap?: LLMProvider };
import { ToolRegistry } from "./registry.ts";
import { ModelRouter } from "./router.ts";
import { CompressionManager, parallelExecute } from "./compression.ts";
import { RuntimeObserver } from "./observer.ts";
import { SkillRegistry } from "./skills.ts";
import { buildForgeAgentSystemInput } from "./agent-system-input.ts";
import {
  isAdvisoryQuestion,
  isConversationalTurn,
  isConversationalTurnEarly,
  runAdvisoryPhase,
  runConversationalPhase,
} from "./conversational.ts";
import { sanitizeUserFacingProse } from "./sanitize-prose.ts";
import {
  ANTI_LEAK_RULE,
  buildAgentContextForLlm,
  buildExecuteInstruction,
  extractOriginalUserRequest,
  INVENTORY_SYSTEM,
  isProjectInventoryQuestion,
} from "./run-context.ts";
import {
  formatClarifyMessage,
  hasMixedMetaAndExecution,
  isPlanModePatchTool,
  mergeExecutionToolDefinitions,
  mergePlanModeToolDefinitions,
  proposedPlanFromToolArgs,
  splitMetaToolCalls,
} from "./tools/meta.ts";

import { friendlyLlmError } from "./llm-errors.ts";
import { MAX_CHUNK_GENERATIONS } from "../_shared/agent-chunk-limits.ts";
import { hashToolBatch, isExecutionStuck } from "../_shared/agent-stuck.ts";
import {
  assistantContentForHistory,
  decideToolProgress,
  TOOL_FAIL_USER_MESSAGE,
} from "./tool-progress.ts";
import { logger } from "../_shared/logger.ts";
import { appendExecutionLogEntry, buildExecutionLogMeta } from "./executionLogMeta.ts";
import { isDuplicateNarrationChunk } from "./narration-dedupe.ts";
import { checkpointChatText } from "./checkpoint-chat.ts";
import { type CheckpointExtra, resumeStepStart, serializeCheckpointPayload } from "./checkpoint.ts";
import {
  generatePlanChatMessage,
  findLatestStoredPlan,
  isShowExistingPlanRequest,
  lastPlanContextFromMessages,
  PLAN_APPROVAL_TTL_MS,
  sanitizePlanHeadline,
} from "./plan-mode.ts";
import { isPlanShapedMarkdown, planToolArgsFromMarkdown } from "./plan-markdown-parse.ts";
import { buildPlanModeTurnInstruction } from "./plan-mode.ts";
import { deriveClassificationFromPrompt, type ClassificationResult } from "./router.ts";
import type { ProviderConfig } from "./providers.ts";
import type { AgentPreferencesPayload } from "./connector-keys.ts";
import { resolveAutoForComplexity } from "../_shared/model-presets.ts";
import { ResilientLLM } from "./robin-pool.ts";
import {
  formatLoopStatus,
  resolveClosureText,
  type LoopUpdateContext,
} from "./loop-status.ts";
import {
  buildPhaseTaskTitle,
  describeStepExpectation,
  extractStepFilePaths,
} from "../_shared/step-intent.ts";
import { type AgentStateData, applyTransition, isTerminal } from "./agent-fsm.ts";

type StreamCallback = (event: { type: string; data: unknown }) => void;

const CHECKPOINT_INTERVAL_STEPS = 2;
const MAX_LLM_RETRIES = 3;

const ANDROID_NATIVE_PATH_RE =
  /(^|\/)(build\.gradle(\.kts)?|settings\.gradle(\.kts)?|gradle\.properties|gradlew|app\/src\/main\/|\.kt$|AndroidManifest\.xml)/i;

function isAndroidNativePath(path: string): boolean {
  return ANDROID_NATIVE_PATH_RE.test(path.replace(/^\//, ""));
}

function isGradleCommand(command: string): boolean {
  return /gradle|gradlew|assembleDebug|assembleRelease/i.test(command);
}

function resolveLoopBudgetMs(): number {
  const raw =
    (typeof globalThis.Deno !== "undefined" ? Deno.env.get("AGENT_LOOP_BUDGET_MS") : undefined) ??
    (typeof process !== "undefined" ? process.env.AGENT_LOOP_BUDGET_MS : undefined);
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const inngest =
    (typeof process !== "undefined" && process.env.INNGEST_EXECUTOR === "1") ||
    (typeof globalThis.Deno !== "undefined" && Deno.env.get("INNGEST_EXECUTOR") === "1");
  // Edge: ~90s; Inngest/Vercel step: ~4.5m (fits vercel maxDuration 300s).
  return inngest ? 270_000 : 90_000;
}

const LOOP_BUDGET_MS = resolveLoopBudgetMs();
const THINKING_STREAM_CAP_MS = 45_000;
function calculateMaxSteps(complexity: 1 | 2 | 3 | 4 | 5): number {
  const limits: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 50,
    2: 60,
    3: 70,
    4: 85,
    5: 100,
  };
  return limits[complexity] ?? 60;
}

export class AgentLoop {
  private reg: ToolRegistry;
  private state: AgentState;
  private llm: LLMProvider;
  private sb: any;
  private onStream: StreamCallback;
  private router: ModelRouter;
  private compression: CompressionManager;
  private observer: RuntimeObserver;
  private skills: SkillRegistry;
  private robinActive: boolean;
  private projectTemplate: string;
  private stackAddon: string;
  private maxStepsLimit: number;
  private tasteStart: boolean;
  private sessionAddon: string;
  private userSkillNames: string[];
  private resumeRun: boolean;
  private hasCheckpoint: boolean;
  private resumePhase: LoopPhase | null;
  private complexityScore: number;
  private runId: string | null;
  private originalUserRequest: string;
  private toolsInvoked: boolean;
  private runStartTime: number;
  private lastCheckpointStep: number;
  private planMode: boolean;
  private approvedPlanBuild: boolean;
  private skipConversationalGate: boolean;
  private approvedPlanSteps: PlanStep[];
  private approvedPlanStepIndex: number;
  private narrationStarted: boolean;
  private narrationBuffer: string;
  private lastStepHadAgentProse: boolean;
  private llmResponseWasStreamed: boolean;
  private toolMissCount: number;
  private forceToolsNext: boolean;
  private thinkingStreamStartedAt: number | null;
  private lastExecutePhaseMessage: string | null;
  private chunkGeneration: number;
  private touchedPaths: Set<string>;
  private lastActivityAt: number;
  private lastRunMessageId: string | null;
  private buildFixResume: boolean;
  /** FSM state tracking (FORGE 2.0) — validado a cada transição de fase */
  private fsmState: AgentStateData;
  private streamTailBuffer: Array<{
    type: string;
    data: Record<string, unknown>;
    timestamp: number;
  }>;
  /** Cache de conteúdo de arquivos para evitar N+1 queries ao Supabase durante execução */
  private fileContentCache: Map<string, string>;
  private preferences: AgentPreferencesPayload | null;
  private connectorKeys: Record<string, string>;

  constructor(
    reg: ToolRegistry,
    llm: LLMProvider,
    supabase: any,
    state: AgentState,
    onStream: StreamCallback = () => {},
    injectedKeys?: Record<string, string>,
    routerOverrides?: RouterOverrides,
    robinActive = false,
    projectTemplate = "vite-react",
    stackAddon = "",
    options?: {
      maxSteps?: number;
      tasteStart?: boolean;
      sessionAddon?: string;
      userSkillNames?: string[];
      resumeRun?: boolean;
      hasCheckpoint?: boolean;
      resumePhase?: LoopPhase | null;
      complexityScore?: number;
      maxStepsFromCheckpoint?: number;
      runId?: string | null;
      /** Fase 4.6 plan mode: emite plan_proposed + pausa pra aprovação do usuário. */
      planMode?: boolean;
      /** Run de build disparada por planApprove — pula qualify e usa planSummary. */
      approvedPlanBuild?: boolean;
      /** Pula gate conversacional pós-stub (build pós-plano aprovado / follow-up). */
      skipConversationalGate?: boolean;
      planSummary?: string;
      planHeadline?: string;
      planSteps?: PlanStep[];
      /** Retomada após falha de build — pula re-narração de intenção. */
      buildFixResume?: boolean;
      /** mainCfg de resolveAgentProvider — label/modelo exatos do BYOK do usuário */
      resolvedMainCfg?: ProviderConfig;
      /** Preferências /models — Auto troca modelo por complexidade; Fixo/ROBIN não */
      preferences?: AgentPreferencesPayload;
      /** Retomada Inngest entre chunks — alimenta mensagem explore na timeline. */
      chunkGeneration?: number;
    },
  ) {
    this.reg = reg;
    this.llm = llm;
    this.connectorKeys = injectedKeys ?? {};
    this.preferences = options?.preferences ?? null;
    this.sb = supabase;
    this.state = state;
    this.onStream = onStream;
    this.robinActive = robinActive;
    this.projectTemplate = projectTemplate;
    this.stackAddon = stackAddon;
    this.maxStepsLimit = options?.maxSteps ?? 20;
    this.tasteStart = options?.tasteStart ?? false;
    this.sessionAddon = options?.sessionAddon ?? "";
    this.userSkillNames = options?.userSkillNames ?? [];
    this.resumeRun = options?.resumeRun ?? false;
    this.hasCheckpoint = options?.hasCheckpoint ?? false;
    this.resumePhase = options?.resumePhase ?? null;
    this.complexityScore = options?.complexityScore ?? 3;
    if (options?.maxStepsFromCheckpoint && options.maxStepsFromCheckpoint > 0) {
      this.maxStepsLimit = options.maxStepsFromCheckpoint;
    }
    this.runId = options?.runId ?? null;
    this.planMode = options?.planMode ?? false;
    this.approvedPlanBuild = options?.approvedPlanBuild ?? false;
    this.skipConversationalGate =
      options?.skipConversationalGate ?? options?.approvedPlanBuild ?? false;
    this.approvedPlanSteps = options?.planSteps ?? [];
    this.approvedPlanStepIndex = 0;
    const extracted = extractOriginalUserRequest(state.messages);
    const planDocument = options?.planSummary?.trim() ?? "";
    this.originalUserRequest = this.approvedPlanBuild && planDocument ? planDocument : extracted;
    this.toolsInvoked = false;
    this.narrationStarted = false;
    this.narrationBuffer = "";
    this.lastStepHadAgentProse = false;
    this.llmResponseWasStreamed = false;
    this.toolMissCount = 0;
    this.forceToolsNext = false;
    this.thinkingStreamStartedAt = null;
    this.lastExecutePhaseMessage = null;
    this.chunkGeneration = options?.chunkGeneration ?? 0;
    this.touchedPaths = new Set();
    this.lastActivityAt = Date.now();
    this.lastRunMessageId = null;
    this.buildFixResume = options?.buildFixResume ?? false;
    this.fsmState = { name: "idle", since: Date.now() };
    this.streamTailBuffer = [];
    this.fileContentCache = new Map();
    this.runStartTime = Date.now();
    this.lastCheckpointStep = options?.hasCheckpoint ? (state.currentStepIndex ?? 0) : 0;
    this.router = new ModelRouter(injectedKeys, routerOverrides, options?.resolvedMainCfg);
    this.observer = new RuntimeObserver(reg, this.fileContentCache);
    this.skills = new SkillRegistry();
    this.compression = new CompressionManager(this.configuredModel(), (type, data) =>
      this.emit(type, data),
    );
  }

  /** Modelo BYOK configurado pelo usuário — única voz do chat e da execução. */
  private configuredModel(): LLMProvider {
    return this.llm;
  }

  /**
   * AUTO: escolhe preset por potência da demanda (complexidade fixa ou do checkpoint).
   * FIXO / ROBIN: no-op — o nome do modo já define o comportamento.
   */
  private applyAutoModelForComplexity(complexity: number): void {
    if (this.preferences?.mode !== "auto") return;

    const wire = resolveAutoForComplexity(
      this.connectorKeys,
      complexity,
      this.preferences.autoAllowedPresetIds,
      this.preferences.userModelEntries,
    );
    if (!wire) return;

    const newCfg: ProviderConfig = {
      provider: wire.provider,
      apiKey: wire.apiKey,
      model: wire.model,
      baseUrl: wire.baseUrl,
      label: `${wire.label} (Auto · exec c${complexity})`,
    };

    const cur = this.router.mainCfg;
    if (cur.provider === newCfg.provider && cur.model === newCfg.model) {
      this.router.setResolvedCfg(newCfg);
      return;
    }

    if (this.llm instanceof ResilientLLM) {
      this.llm.updateCfg(newCfg);
    }
    this.router.setResolvedCfg(newCfg);
  }

  private loopBudgetExceeded(): boolean {
    return Date.now() - this.runStartTime > LOOP_BUDGET_MS;
  }

  private requiresFinalBuildGate(): boolean {
    if (this.planMode || this.tasteStart) return false;
    if (this.touchedPaths.size > 0) return true;
    const webTemplates = ["vite-react", "nextjs-app-router", "tanstack-start", "astro"];
    return webTemplates.includes(this.projectTemplate) && this.toolsInvoked;
  }

  private async returnResumableChunk(
    steps: number,
    toolsUsed: Set<string>,
    options?: { buildFix?: boolean },
  ): Promise<{
    ok: false;
    error: string;
    steps: number;
    resumable: true;
    buildFix?: boolean;
    toolsUsed: string[];
  }> {
    await this.saveCheckpoint(this.state.phase, true);
    await this.emitDeliveryCheckpoint(steps);
    await this.touchHeartbeat();
    this.emit("timeout_warning", {
      message: options?.buildFix
        ? "Corrigindo erros de build no servidor"
        : "Retomando automaticamente no servidor",
      elapsedMs: Date.now() - this.runStartTime,
      buildFix: options?.buildFix === true,
    });
    await this.persistCheckpointChat(steps, options?.buildFix);
    return {
      ok: false,
      error: options?.buildFix ? "Corrigindo erros de build…" : "Retomando automaticamente…",
      steps,
      resumable: true,
      buildFix: options?.buildFix === true,
      toolsUsed: [...toolsUsed],
    };
  }

  private appendToNarration(text: string): void {
    const chunk = text.trim();
    if (!chunk) return;
    this.narrationBuffer = this.narrationBuffer ? `${this.narrationBuffer}\n\n${chunk}` : chunk;
    this.lastActivityAt = Date.now();
  }

  private recordTouchedPath(path: string): void {
    if (path) this.touchedPaths.add(path);
  }

  private async touchHeartbeat(): Promise<void> {
    if (!this.runId) return;
    try {
      await this.sb
        .from("agent_runs")
        .update({ heartbeat_at: new Date().toISOString() })
        .eq("id", this.runId);
    } catch {
      /* best-effort */
    }
    this.lastActivityAt = Date.now();
  }

  private async bumpLlmRetries(): Promise<number> {
    if (!this.runId) return MAX_LLM_RETRIES;
    try {
      const { data: row } = await this.sb
        .from("agent_runs")
        .select("meta")
        .eq("id", this.runId)
        .maybeSingle();
      const meta = (row?.meta ?? {}) as Record<string, unknown>;
      const next = (typeof meta.llmRetries === "number" ? meta.llmRetries : 0) + 1;
      await this.sb
        .from("agent_runs")
        .update({ meta: { ...meta, llmRetries: next } })
        .eq("id", this.runId);
      return next;
    } catch {
      return MAX_LLM_RETRIES;
    }
  }

  private async resetLlmRetries(): Promise<void> {
    if (!this.runId) return;
    try {
      const { data: row } = await this.sb
        .from("agent_runs")
        .select("meta")
        .eq("id", this.runId)
        .maybeSingle();
      const meta = (row?.meta ?? {}) as Record<string, unknown>;
      if (typeof meta.llmRetries !== "number" || meta.llmRetries === 0) return;
      await this.sb
        .from("agent_runs")
        .update({ meta: { ...meta, llmRetries: 0 } })
        .eq("id", this.runId);
    } catch {
      /* best-effort */
    }
  }

  private maybeEmitSilenceHeartbeat(): void {
    if (Date.now() - this.lastActivityAt < 90_000) return;
    this.emit("heartbeat", {
      message: "Ainda processando o modelo…",
      silentMs: Date.now() - this.lastActivityAt,
    });
  }

  private async emitDeliveryCheckpoint(step: number): Promise<void> {
    const deliveryFiles = [...this.touchedPaths];
    const narration = this.narrationBuffer.trim();
    this.emit("delivery_checkpoint", {
      step,
      totalSteps: this.maxStepsLimit,
      deliveryFiles,
      narration: narration.slice(0, 4000),
      resumable: true,
      silent: true,
      message:
        deliveryFiles.length > 0
          ? `${deliveryFiles.length} arquivo(s) prontos — continuo em seguida`
          : "Continuo em seguida",
    });
  }

  private async clearCheckpoint(): Promise<void> {
    try {
      await this.sb
        .from("agent_checkpoints")
        .delete()
        .eq("project_id", this.state.projectId)
        .eq("conversation_id", this.state.conversationId);
    } catch {
      /* não bloqueia conclusão */
    }
  }

  private async saveCheckpoint(phase: LoopPhase, force = false): Promise<void> {
    if (!this.runId) return;
    const step = this.state.currentStepIndex;
    if (!force && step - this.lastCheckpointStep < CHECKPOINT_INTERVAL_STEPS) {
      return;
    }
    if (Date.now() - this.runStartTime > LOOP_BUDGET_MS) {
      this.emit("timeout_warning", {
        message: "Próximo do limite de tempo da Edge Function — salvando checkpoint",
        elapsedMs: Date.now() - this.runStartTime,
      });
    }
    try {
      const extra: CheckpointExtra = {
        complexityScore: this.complexityScore,
        maxStepsLimit: this.maxStepsLimit,
      };
      await this.sb.from("agent_checkpoints").upsert(
        {
          project_id: this.state.projectId,
          conversation_id: this.state.conversationId,
          phase,
          state: serializeCheckpointPayload(this.state, extra),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,conversation_id" },
      );
      this.lastCheckpointStep = step;
    } catch (err) {
      logger.error("agent.checkpoint_save_failed", {
        runId: this.runId ?? undefined,
        step,
        phase: phase as string,
        error: (err as Error)?.message,
      });
    }
  }

  private async emitTransition(eventType: string, data?: unknown): Promise<void> {
    const result = applyTransition(this.fsmState, {
      type: eventType as any,
      data,
      timestamp: Date.now(),
    });
    if (result.ok) {
      this.fsmState = result.state;
    }
    this.emit("fsm_transition", {
      from: result.from,
      to: result.to,
      event: eventType,
      ok: result.ok,
      error: result.error,
      stateName: this.fsmState.name,
    });
  }

  async run(): Promise<{
    ok: boolean;
    summary?: string;
    error?: string;
    steps: number;
    resumable?: boolean;
    canceled?: boolean;
    toolsUsed?: string[];
    totalInputTokens?: number;
    totalOutputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  }> {
    if (!this.resumeRun) {
      this.state.executionLog = [];
    }
    if (this.chunkGeneration > 0) {
      this.emit("explore", {
        message: `Retomando execução no servidor (parte ${this.chunkGeneration}/${MAX_CHUNK_GENERATIONS})…`,
      });
    }
    this.compression.reset();
    const toolsUsed = new Set<string>();
    let executionModel = this.configuredModel();

    if (this.resumeRun && this.hasCheckpoint) {
      await this.emitTransition("send");
      this.emit("phase", {
        phase: "resume",
        message: "Retomando execução…",
      });
      this.emit("memory", {
        message: `Checkpoint: ${this.state.messages.length} mensagens, fase ${
          this.resumePhase ?? this.state.phase
        }`,
        messageCount: this.state.messages.length,
      });
      this.applyAutoModelForComplexity(this.complexityScore);
      this.emit("classify", {
        complexity: this.complexityScore,
        model: this.router.mainCfg.label,
        summary: this.state.intent?.summary ?? "Retomada",
        maxSteps: this.maxStepsLimit,
        restored: true,
      });
      this.notifyLoopStatus({
        kind: "resume",
        fixResume: this.buildFixResume,
        resumeStep: this.state.currentStepIndex,
        total: this.maxStepsLimit,
      });
      await this.emitTransition("classified", {
        complexity: this.complexityScore,
        summary: this.state.intent?.summary ?? "Retomada",
        restored: true,
      });
      if (!this.planMode) {
        await this.emitTransition("no_plan_needed");
      }

      // Plan runs terminate after proposing (no in-memory decision wait).
      // The plan is emitted to the client via Realtime; approval/rejection
      // creates a new build run via the plan-decide server action.
    } else {
      if (
        !this.resumeRun &&
        !this.approvedPlanBuild &&
        this.originalUserRequest &&
        isConversationalTurnEarly(this.originalUserRequest)
      ) {
        return await this.runConversationalReply();
      }

      if (
        !this.resumeRun &&
        !this.approvedPlanBuild &&
        this.planMode &&
        this.originalUserRequest &&
        isShowExistingPlanRequest(this.originalUserRequest)
      ) {
        const stored = findLatestStoredPlan(this.state.messages);
        if (stored) {
          const reopened: ProposedPlan = {
            ...stored.plan,
            planId: crypto.randomUUID(),
            summary: sanitizePlanHeadline(
              stored.plan.mission ?? stored.plan.summary,
              "Plano proposto",
            ),
            proposedAt: new Date().toISOString(),
            ttlMs: PLAN_APPROVAL_TTL_MS,
          };
          return await this.finishPlanProposal(reopened);
        }
        const reply =
          "Ainda não há plano nesta conversa. Descreva o que quer construir e eu monto um para você revisar.";
        this.emit("assistant_text", { text: reply, final: true });
        await this.persistFinal(reply, { lastFinishOk: true, conversational: true });
        await this.clearCheckpoint();
        await this.markRunStatus("completed");
        this.emit("done", { summary: reply, conversational: true });
        return { ok: true, summary: reply, steps: 0, toolsUsed: [] };
      }

      if (this.resumeRun) {
        this.appendResumeInstruction();
        this.emit("phase", {
          phase: "resume",
          message: "Retomando a partir do histórico salvo no chat…",
        });
      }

      await this.gatherContext();
      if (this.loopBudgetExceeded()) {
        return this.returnResumableChunk(0, toolsUsed);
      }
      await this.saveCheckpoint(LoopPhase.GATHER_CONTEXT);

      const isApprovedOrSkip = this.approvedPlanBuild || this.skipConversationalGate;
      const userPrompt =
        this.originalUserRequest?.trim() ||
        (() => {
          const last = this.state.messages.filter((m) => m.role === "user").pop()?.content;
          return typeof last === "string" ? last.trim() : "";
        })();

      const classification: ClassificationResult = isApprovedOrSkip
        ? {
            complexity: (this.complexityScore || 3) as 1 | 2 | 3 | 4 | 5,
            type: "modify",
            summary: (userPrompt || "Executar plano aprovado").slice(0, 200),
            needsBuild: true,
            needsDeps: false,
          }
        : deriveClassificationFromPrompt(userPrompt, this.planMode);

      if (this.loopBudgetExceeded()) {
        return this.returnResumableChunk(0, toolsUsed);
      }

      this.complexityScore = classification.complexity;
      this.state.intent = {
        type: classification.type as IntentAnalysis["type"],
        summary: classification.summary,
        scope: [],
        complexity: "medium",
      };
      this.maxStepsLimit = calculateMaxSteps(classification.complexity);
      this.applyAutoModelForComplexity(classification.complexity);
      executionModel = this.configuredModel();

      if (this.fsmState.name === "idle") {
        await this.emitTransition("send");
      }
      await this.emitTransition("classified", classification);

      if (
        !isApprovedOrSkip &&
        this.originalUserRequest &&
        isConversationalTurn(this.originalUserRequest, classification)
      ) {
        return await this.runConversationalReply();
      }

      // Inventário do projeto — responde com contexto real, sem fs_write.
      if (
        this.originalUserRequest &&
        isAdvisoryQuestion(this.originalUserRequest) &&
        !this.approvedPlanBuild
      ) {
        return await this.runAdvisoryReply();
      }

      if (
        this.originalUserRequest &&
        isProjectInventoryQuestion(this.originalUserRequest) &&
        !this.planMode
      ) {
        const inv = (await this.runInventoryPhase(executionModel)).trim();
        if (!inv) {
          return {
            ok: false,
            error: "Não foi possível resumir o estado do projeto.",
            steps: 0,
            toolsUsed: [],
          };
        }
        this.emit("assistant_text", { text: inv, final: true });
        await this.persistFinal(inv);
        await this.clearCheckpoint();
        await this.markRunStatus("completed");
        this.emit("done", { summary: inv, inventory: true });
        return { ok: true, summary: inv, steps: 0, toolsUsed: [] };
      }

      if (this.planMode) {
        return await this.runPlanModeAgentTurn(executionModel);
      }

      this.emit("phase", {
        phase: "build",
        message: "Implementando mudanças…",
        intent: this.state.intent,
      });

      if (this.approvedPlanBuild) {
        this.emit("phase", {
          phase: "build",
          message: "Executando plano aprovado…",
        });
      }

      if (this.fsmState.name === "planning") {
        await this.emitTransition("no_plan_needed");
      }
    }

    if (this.planMode) {
      await this.clearCheckpoint();
      return {
        ok: false,
        error: "Plan mode não executa ferramentas — apenas propõe plano.",
        steps: 0,
        toolsUsed: [...toolsUsed],
      };
    }

    const step =
      this.resumeRun && this.hasCheckpoint
        ? resumeStepStart(this.resumePhase ?? this.state.phase, this.state.currentStepIndex)
        : 0;

    let buildAttempts = 0;
    const maxRetries = 3;
    let loopStep = step;
    let finalGateOk = false;

    while (!finalGateOk) {
      while (loopStep < this.maxStepsLimit) {
        if (this.loopBudgetExceeded()) {
          return this.returnResumableChunk(loopStep, toolsUsed);
        }

        if (await this.isCanceled()) {
          await this.persistFinal("Execução cancelada pelo usuário.");
          this.emit("canceled", { message: "Cancelado pelo usuário" });
          return {
            ok: false,
            error: "Cancelado",
            steps: Math.max(0, loopStep),
            canceled: true,
            toolsUsed: [...toolsUsed],
          };
        }

        loopStep++;
        this.state.currentStepIndex = loopStep;
        this.lastStepHadAgentProse = false;
        this.state.phase = LoopPhase.EXECUTE_STEP;
        await this.touchHeartbeat();
        if (this.approvedPlanBuild) {
          const enabled = this.enabledApprovedPlanSteps();
          this.state.totalSteps = enabled.length;
          this.emit("step", {
            current: this.approvedPlanStepIndex,
            total: enabled.length,
          });
          const activeStep = enabled[this.approvedPlanStepIndex];
          const stepMessage = activeStep
            ? activeStep.description.slice(0, 120)
            : "Trabalhando no plano aprovado…";
          if (stepMessage !== this.lastExecutePhaseMessage) {
            this.emit("phase", {
              phase: "execute",
              message: stepMessage,
            });
            this.lastExecutePhaseMessage = stepMessage;
          }
        } else {
          this.state.totalSteps = this.maxStepsLimit;
          this.emit("step", { current: loopStep, total: this.maxStepsLimit });
          this.emit("phase", {
            phase: "execute",
            message: "Trabalhando no pedido…",
          });
        }

        const compressed = await this.compression.compress(this.state.messages);
        const executeInstruction = buildExecuteInstruction(this.originalUserRequest);
        const actionableIntent =
          this.state.intent?.type === "modify" ||
          this.state.intent?.type === "new_project" ||
          this.state.intent?.type === "fix" ||
          this.state.intent?.type === "add_dep";
        const forceTools =
          this.forceToolsNext ||
          (!this.toolsInvoked &&
            actionableIntent &&
            (this.approvedPlanBuild
              ? loopStep >= 1
              : loopStep >= 2 && loopStep <= 4));
        const narrationOnlyStep =
          !this.forceToolsNext &&
          !this.toolsInvoked &&
          loopStep === 1 &&
          actionableIntent &&
          !this.approvedPlanBuild;
        let response: ChatResponse | null = null;
        try {
          this.maybeEmitSilenceHeartbeat();
          await this.touchHeartbeat();
          response = await this.llmChat(executionModel, executeInstruction, compressed, forceTools);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Erro no modelo";
          const retries = await this.bumpLlmRetries();
          if (retries >= MAX_LLM_RETRIES) {
            const failMsg = `Erro no modelo após ${retries} tentativas: ${message}`;
            await this.persistFinal(failMsg, {
              lastFinishOk: false,
              buildFailed: true,
            });
            return {
              ok: false,
              error: failMsg,
              steps: loopStep,
              resumable: false,
              toolsUsed: [...toolsUsed],
            };
          }
          await this.saveCheckpoint(LoopPhase.ERROR, true);
          this.notifyLoopStatus({
            kind: "model_error",
            errorDetail: message,
          });
          return this.returnResumableChunk(loopStep, toolsUsed);
        }
        if (!response) break;

        await this.resetLlmRetries();
        this.compression.recordUsage(response.usage);

        const assistantText = (response.content ?? "").trim();

        if (hasMixedMetaAndExecution(response.tool_calls)) {
          this.state.messages.push({
            role: "assistant",
            content: response.content ?? assistantText,
            tool_calls: response.tool_calls?.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
            })),
          });
          this.state.messages.push({
            role: "user",
            content:
              "Não misture clarify/create_plan com ferramentas de execução no mesmo turno. " +
              "Use só clarify (para perguntar) OU só fs_read/fs_write/fs_edit/shell_exec (para implementar).",
          });
          continue;
        }

        const { clarify: clarifyCall, createPlan: createPlanCall, execution: execCalls } =
          splitMetaToolCalls(response.tool_calls ?? []);
        if (createPlanCall) {
          return {
            ok: false,
            error: "create_plan só é válido em modo Plan.",
            summary: "create_plan só é válido em modo Plan.",
            steps: loopStep,
            toolsUsed: [...toolsUsed, "create_plan"],
          };
        }
        if (clarifyCall && execCalls.length === 0) {
          toolsUsed.add("clarify");
          const clarifyMsg = formatClarifyMessage(clarifyCall.arguments);
          const combined = [assistantText, clarifyMsg].filter(Boolean).join("\n\n").trim();
          return await this.finishClarify(combined, 0, [...toolsUsed]);
        }

        // Sem tool_calls — enforcement mesmo quando thinking foi streamed (content vazio).
        if (!response.tool_calls || response.tool_calls.length === 0) {
          const shouldEnforce =
            forceTools ||
            narrationOnlyStep ||
            this.llmResponseWasStreamed ||
            this.approvedPlanBuild ||
            actionableIntent;
          if (shouldEnforce) {
            const fail = this.applyNoToolCallsEnforcement(response, assistantText, loopStep);
            if (fail) {
              await this.persistFinal(TOOL_FAIL_USER_MESSAGE, { lastFinishOk: false });
              await this.markRunStatus("failed");
              this.emit("finish", {
                ok: false,
                resumable: false,
                error: TOOL_FAIL_USER_MESSAGE,
              });
              return {
                ok: false,
                error: TOOL_FAIL_USER_MESSAGE,
                steps: loopStep,
                resumable: false,
                toolsUsed: [...toolsUsed],
              };
            }
            continue;
          }
          this.state.messages.push({
            role: "assistant",
            content: response.content ?? "Concluído.",
          });
          break;
        }

        this.toolMissCount = 0;
        this.forceToolsNext = false;
        this.toolsInvoked = true;

        if (assistantText) {
          this.emitAgentProse(assistantText);
        }

        this.emit("phase", {
          phase: "execute",
          toolCount: response.tool_calls.length,
        });
        await this.saveCheckpoint(LoopPhase.EXECUTE_STEP);

        // Persiste tool_calls IMEDIATAMENTE para o chat ver via Realtime,
        // enquanto eles ainda estão executando (com status pending).
        const liveMsgId = await this.persistAssistantStep(response);

        const execResults = await parallelExecute(response.tool_calls, async (call) => {
          toolsUsed.add(call.name);

          // ─── Captura o conteúdo ANTES (para diff) antes de mutações em arquivos ───
          let preDiff: {
            path: string;
            before: string;
            after: string;
            op: "write" | "edit";
          } | null = null;
          if (call.name === "fs_write" || call.name === "fs_edit") {
            const filePath = (call.arguments.path as string) ?? "";
            if (filePath) {
              try {
                // Usa cache para evitar N+1 queries ao Supabase
                const before = this.fileContentCache.get(filePath) ?? "";
                let after = before;
                if (call.name === "fs_write") {
                  after = (call.arguments.content as string) ?? "";
                } else {
                  const oldText = (call.arguments.oldText as string) ?? "";
                  const newText = (call.arguments.newText as string) ?? "";
                  const replaceAll = call.arguments.replaceAll === true;
                  // Validação: oldText vazio causaria estouro de memória
                  if (!oldText) {
                    after = before + newText; // Append como fallback seguro
                  } else {
                    after = replaceAll
                      ? before.split(oldText).join(newText)
                      : before.replace(oldText, newText);
                  }
                }
                preDiff = {
                  path: filePath,
                  before,
                  after,
                  op: call.name === "fs_write" ? "write" : "edit",
                };
                // Atualiza cache com o novo conteúdo
                this.fileContentCache.set(filePath, after);
              } catch {
                /* não bloqueia a execução — diff é best-effort */
              }
            }
          }

          this.emit("tool_start", { name: call.name, args: call.arguments });
          const result = await this.reg.execute(call);
          this.emit("tool_done", {
            name: call.name,
            ok: result.ok,
            error: result.error,
          });

          if (call.name === "shell_exec" && isGradleCommand(String(call.arguments.command ?? ""))) {
            const output =
              typeof result.output === "string"
                ? result.output
                : result.output != null
                  ? JSON.stringify(result.output)
                  : (result.error ?? "");
            this.emit("build_log", {
              command: String(call.arguments.command ?? "").slice(0, 240),
              lines: output
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .slice(-40),
              ok: result.ok,
              output: output.slice(0, 4000),
            });
          }

          // ─── Emite o diff para o cliente APÓS tool_done (com o estado final já aplicado) ───
          if (preDiff && result.ok) {
            this.recordTouchedPath(preDiff.path);
            this.emit("file_diff", preDiff);
            const hasGradleScaffold = (this.state.context?.files ?? []).some((f) =>
              /build\.gradle|settings\.gradle/i.test(f.path.replace(/^\//, "")),
            );
            if (
              isAndroidNativePath(preDiff.path) &&
              !hasGradleScaffold &&
              (this.projectTemplate === "vite-react" || this.projectTemplate === "landing-page")
            ) {
              this.emit("stack_fork_suggested", {
                path: preDiff.path,
                suggestedStack: "android-native",
                message:
                  "Detectamos código **mobile nativo** neste projeto web. Quer criar um projeto Android dedicado? (O arquivo foi mantido — nada foi apagado.)",
              });
            }
          }

          if ((call.name === "fs_write" || call.name === "fs_edit") && result.ok) {
            const pathArg = (call.arguments.path as string) ?? call.name;
            this.emit("preview_sync", { path: pathArg, reason: "fs_change" });
          }
          return result;
        });

        // Git commit único por step (não por arquivo) — após todas as tools executarem
        const modifiedPaths = execResults
          .filter(({ call }) => call.name === "fs_write" || call.name === "fs_edit")
          .map(({ call }) => (call.arguments.path as string) ?? call.name)
          .filter(Boolean);
        if (modifiedPaths.length > 0) {
          const commitMsg =
            modifiedPaths.length === 1
              ? `${modifiedPaths[0]}: update`
              : `update ${modifiedPaths.length} files`;
          await this.reg.execute({
            id: crypto.randomUUID(),
            name: "shell_exec",
            arguments: {
              command: `cd /home/user && git add -A && git commit -m "${commitMsg}" 2>&1 || true`,
            },
          });
          // unconditional preview_sync + tick drive on every successful fs_* (live during first-gen seed + follow-up edits)
          this.emit("preview_sync", {
            path: modifiedPaths[0],
            reason: "fs_success",
          });
        }

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: response.content ?? "",
          tool_calls: response.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
        this.state.messages.push(assistantMsg);

        for (const { call, result } of execResults) {
          const raw = JSON.stringify(result);
          let structured = raw;
          if (!result.ok) {
            const toolName = call.name;
            const args = call.arguments;
            const path = String(args.path ?? args.filePath ?? args.file ?? "");
            const errorMsg = String(result.error ?? "unknown error");
            const outputSample =
              typeof result.output === "string"
                ? result.output.slice(0, 200)
                : typeof result.output === "object"
                  ? JSON.stringify(result.output).slice(0, 200)
                  : "";

            const hints: string[] = [];
            if (toolName === "fs_write" || toolName === "fs_edit") {
              hints.push(
                `Verifique se o diretório de ${path ? path.split("/").slice(0, -1).join("/") : "destino"} existe antes de escrever.`,
              );
              hints.push("Use shell_exec com `mkdir -p` ou `test -d` para garantir o caminho.");
            } else if (toolName === "shell_exec") {
              const cmd = String(args.command ?? "").slice(0, 120);
              if (/npm (install|add)\b/.test(cmd))
                hints.push(
                  "Tente `npm install --legacy-peer-deps` ou limpe node_modules primeiro.",
                );
              if (/npx tsc/.test(cmd))
                hints.push("Verifique se tsconfig.json está correto e os tipos estão instalados.");
              if (/npm run build/.test(cmd) && outputSample)
                hints.push(`Build falhou: ${outputSample.slice(0, 120)}`);
              if (!outputSample)
                hints.push("Comando não produziu saída — verifique se o binário existe.");
            } else if (toolName === "fs_search" || toolName === "fs_read") {
              hints.push(
                `O caminho ${path || "<vazio>"} pode não existir. Verifique com shell_exec + test -e.`,
              );
            }

            structured = JSON.stringify({
              ok: false,
              tool: toolName,
              error: errorMsg,
              ...(path ? { path } : {}),
              ...(outputSample ? { output: outputSample.slice(0, 500) } : {}),
              hint: hints.length > 0 ? hints.join(" ") : undefined,
            });
          }
          this.state.messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: structured.slice(0, 8000),
          });
        }

        this.notifyLoopStatus({
          kind: "tool_batch",
          tools: response.tool_calls.map((tc) => ({
            name: tc.name,
            arguments: tc.arguments,
          })),
          step: loopStep,
          total: this.maxStepsLimit,
          allOk: execResults.every(({ result }) => result.ok),
        });

        if (
          this.approvedPlanBuild &&
          execResults.every(({ result }) => result.ok) &&
          this.approvedPlanStepIndex < this.enabledApprovedPlanSteps().length - 1
        ) {
          this.approvedPlanStepIndex++;
          const enabled = this.enabledApprovedPlanSteps();
          this.emit("step", {
            current: this.approvedPlanStepIndex,
            total: enabled.length,
          });
        }

        // Extra cancel check after potentially long tool execution (shell, writes, observer).
        // Combined with per-step check this makes stop responsive without full AbortSignal everywhere.
        if (await this.isCanceled()) {
          await this.persistFinal("Execução cancelada pelo usuário.");
          this.emit("canceled", { message: "Cancelado pelo usuário" });
          return {
            ok: false,
            error: "Cancelado",
            steps: Math.max(0, loopStep),
            canceled: true,
            toolsUsed: [...toolsUsed],
          };
        }

        const stepHash = hashToolBatch(
          response.tool_calls
            .filter((tc) => tc.name !== "fs_write" && tc.name !== "fs_edit")
            .map((tc) => ({
              name: tc.name,
              arguments: tc.arguments,
            })),
        );
        this.state.executionLog = appendExecutionLogEntry(this.state.executionLog, stepHash);

        // Coleta arquivos modificados para type-check incremental
        const modifiedFilePaths = response.tool_calls
          .filter((t) => t.name === "fs_write" || t.name === "fs_edit")
          .map((t) => t.arguments.path as string)
          .filter(Boolean);

        // Atualiza a mensagem persistida com o resultado (status, error, output curto)
        if (liveMsgId) {
          await this.updateAssistantStep(liveMsgId, response, execResults, loopStep);
        }

        // Quick TypeScript check incremental (rápido, apenas arquivos modificados)
        if (modifiedFilePaths.length > 0) {
          const typeCheck = await this.observer.quickTypeCheck(modifiedFilePaths);
          if (!typeCheck.ok) {
            this.notifyLoopStatus({ kind: "typecheck_fail" });
            this.emit("typecheck_fail", {
              errors: typeCheck.errors,
              files: modifiedFilePaths,
            });
            this.state.messages.push({
              role: "user",
              content: `TYPECHECK FALHOU nos arquivos modificados:\n\n${typeCheck.errors
                .map((e) => `${e.file}:${e.line}:${e.column} - ${e.code}: ${e.message}`)
                .join("\n")}\n\nCorrija os erros acima com fs_edit antes de continuar.`,
            });
            continue;
          }
        }

        const modifiedFiles = modifiedFilePaths.length > 0;
        if (modifiedFiles && buildAttempts < maxRetries) {
          this.state.phase = LoopPhase.VALIDATE_STEP;
          this.notifyLoopStatus({ kind: "build_check" });
          this.emit("phase", {
            phase: "observe",
            message: "Verificando build...",
          });
          await this.saveCheckpoint(LoopPhase.VALIDATE_STEP);
          const observation = await this.observer.observe();
          if (!observation.passed) {
            buildAttempts++;
            this.emit("validate_fail", {
              attempt: buildAttempts,
              checks: observation.checks.filter((c) => !c.ok).map((c) => c.name),
              feedback: observation.feedback?.slice(0, 500),
            });
            this.state.messages.push({
              role: "user",
              content: `VERIFICAÇÃO FALHOU (${buildAttempts}/${maxRetries}). Analise e corrija:\n\n\`\`\`\n${observation.feedback?.slice(
                0,
                3000,
              )}\n\`\`\`\n\nNÃO peça ajuda. Use fs_search/fs_edit para corrigir.`,
            });
            continue;
          } else {
            buildAttempts = 0;
            this.notifyLoopStatus({ kind: "build_ok" });
            this.emit("validate_ok", { message: "Build OK" });
          }
        }

        if (isExecutionStuck(this.state.executionLog)) {
          this.notifyLoopStatus({ kind: "stuck" });
          this.emit("stuck", {
            message: "Padrão repetitivo detectado — injetando instrução para nova abordagem",
          });
          this.state.messages.push({
            role: "user",
            content:
              "ATENÇÃO: Você está repetindo as mesmas ferramentas. PARE e tente uma abordagem DIFERENTE. " +
              "Use fs_search para entender o código atual, depois fs_edit para corrigir. Não repita fs_write no mesmo arquivo.",
          });
        }

        await this.saveCheckpoint(LoopPhase.DECIDE_NEXT);
      }

      if (loopStep >= this.maxStepsLimit) {
        await this.saveCheckpoint(LoopPhase.DECIDE_NEXT, true);
        return this.returnResumableChunk(loopStep, toolsUsed, {
          buildFix: this.requiresFinalBuildGate(),
        });
      }

      if (!this.requiresFinalBuildGate()) {
        finalGateOk = true;
        continue;
      }

      this.state.phase = LoopPhase.VALIDATE_STEP;
      this.emit("phase", {
        phase: "observe",
        message: "Verificação final de build...",
      });
      await this.saveCheckpoint(LoopPhase.VALIDATE_STEP);
      const finalObservation = await this.observer.observe();
      if (finalObservation.passed) {
        this.notifyLoopStatus({ kind: "build_ok" });
        this.emit("validate_ok", { message: "Build OK (gate final)" });
        finalGateOk = true;
        continue;
      }

      buildAttempts++;
      this.emit("validate_fail", {
        attempt: buildAttempts,
        checks: finalObservation.checks.filter((c) => !c.ok).map((c) => c.name),
        feedback: finalObservation.feedback?.slice(0, 500),
        finalGate: true,
      });

      if (buildAttempts > maxRetries) {
        const failMsg =
          `Build não passou após ${maxRetries} tentativas.\n\n` +
          `${finalObservation.feedback?.slice(0, 2000) ?? "Erros de compilação no sandbox."}`;
        await this.persistFinal(failMsg, {
          lastFinishOk: false,
          buildFailed: true,
        });
        return {
          ok: false,
          error: failMsg,
          steps: loopStep,
          resumable: false,
          toolsUsed: [...toolsUsed],
        };
      }

      if (this.loopBudgetExceeded()) {
        return this.returnResumableChunk(loopStep, toolsUsed, {
          buildFix: true,
        });
      }

      this.state.messages.push({
        role: "user",
        content:
          `BUILD GATE FINAL FALHOU (${buildAttempts}/${maxRetries}). Corrija antes de finalizar:\n\n` +
          `\`\`\`\n${finalObservation.feedback?.slice(0, 6000) ?? ""}\n\`\`\`\n\n` +
          `Os erros reais de compilação estão acima — corrija cada um com fs_edit. Verifique imports, tipos e sintaxe.`,
      });
      this.notifyLoopStatus({ kind: "build_fix" });
    }

    this.state.phase = LoopPhase.SUMMARIZE;
    await this.emitTransition("delivered");
    this.emit("phase", { phase: "summarize", message: "Finalizando..." });
    await this.saveCheckpoint(LoopPhase.SUMMARIZE, true);
    const closingText = sanitizeUserFacingProse(
      resolveClosureText({
        messages: this.state.messages,
        touchedPaths: [...this.touchedPaths],
        userRequest: this.originalUserRequest ?? undefined,
      }),
    );

    if (closingText) {
      this.emit("assistant_text", {
        text: closingText,
        append: false,
        final: true,
      });
    }

    await this.persistFinal(closingText || "Pronto.", {
      lastFinishOk: true,
    });
    await this.clearCheckpoint();
    const tokens = this.compression.getTotalTokens();
    const costUsd = this.compression.getEstimatedCostUsd(this.router.mainCfg.model);
    this.emit("done", {
      summary: (closingText || "Pronto.").slice(0, 2000),
      totalInputTokens: tokens.input,
      totalOutputTokens: tokens.output,
      totalTokens: tokens.total,
      costUsd,
    });
    return {
      ok: true,
      summary: (closingText || "Pronto.").slice(0, 2000),
      steps: loopStep,
      toolsUsed: [...toolsUsed],
      totalInputTokens: tokens.input,
      totalOutputTokens: tokens.output,
      totalTokens: tokens.total,
      costUsd,
    };
  }

  private async gatherContext(): Promise<void> {
    await this.touchHeartbeat();
    const { data: files } = await this.sb
      .from("project_files")
      .select("path, content, updated_at")
      .eq("project_id", this.state.projectId);

    const fileList: FileEntry[] = files ?? [];
    // Preenche cache de arquivos para evitar N+1 queries durante execução
    for (const f of fileList) {
      if (f.content != null) {
        this.fileContentCache.set(f.path, f.content);
      }
    }
    const manifest = fileList.map((f) => `  ${f.path}`).join("\n");

    let projectConfig = "";
    const keyFiles = fileList.filter((f) =>
      [
        "package.json",
        "tsconfig.json",
        "vite.config.ts",
        "tailwind.config.ts",
        "index.html",
        "src/App.tsx",
        "src/main.tsx",
        "src/index.css",
      ].includes(f.path),
    );
    for (const f of keyFiles) {
      projectConfig += `\n### ${f.path}\n\`\`\`\n${(f.content ?? "").slice(0, 2000)}\n\`\`\`\n`;
    }

    const stackSkills = this.skills.detectActive(fileList).map((s) => s.name);
    const activeSkills = [...new Set([...stackSkills, ...this.userSkillNames])];
    if (activeSkills.length > 0) {
      this.emit("skills", {
        active: activeSkills,
        stack: stackSkills,
        user: this.userSkillNames,
      });
    }

    const agentCtx = buildAgentContextForLlm(
      fileList,
      projectConfig || "(projeto vazio — sem arquivos de configuração)",
      manifest || "(projeto vazio)",
    );

    this.state.context = {
      files: fileList,
      manifest: agentCtx.manifest,
      projectConfig: agentCtx.projectConfig,
      gitLog: "(não disponível ainda)",
      dbSchema: "(não disponível)",
      lastPlan: lastPlanContextFromMessages(this.state.messages),
    };
  }

  private async finishPlanModeFailure(
    summary: string,
    steps: number,
    toolsUsed: readonly string[],
    error?: string,
  ): Promise<{
    ok: false;
    summary: string;
    steps: number;
    toolsUsed: string[];
    error: string;
  }> {
    const message = summary.trim() || "Erro no modo Plan.";
    const err = (error ?? message).trim() || message;
    this.emit("assistant_text", { text: message, final: true });
    await this.persistFinal(message, { lastFinishOk: false });
    await this.clearCheckpoint();
    return {
      ok: false,
      summary: message,
      steps,
      toolsUsed: [...toolsUsed],
      error: err,
    };
  }

  private async finishPlanProposal(
    proposedPlan: ProposedPlan,
    toolsUsed: string[] = [],
  ): Promise<{
    ok: boolean;
    summary: string;
    steps: number;
    toolsUsed: string[];
  }> {
    const planChatText = await generatePlanChatMessage(this.configuredModel(), proposedPlan);
    if (!planChatText) {
      return {
        ok: false,
        summary: "Não foi possível gerar a mensagem do plano.",
        steps: 0,
        toolsUsed: [],
      };
    }
    this.emit("assistant_text", { text: planChatText, final: true });
    this.emit("plan_proposed", {
      planId: proposedPlan.planId,
      summary: proposedPlan.summary,
      rationale: proposedPlan.rationale,
      markdown: proposedPlan.markdown,
      mission: proposedPlan.mission,
      objective: proposedPlan.objective,
      steps: proposedPlan.steps,
      runId: this.runId,
      projectId: this.state.projectId,
    });
    logger.event("agent_run.plan_proposed", {
      runId: this.runId ?? undefined,
      planId: proposedPlan.planId,
      stepCount: proposedPlan.steps.length,
    });
    await this.emitTransition("plan_proposed", proposedPlan);
    await this.persistPlanFinal(planChatText, proposedPlan);
    await this.clearCheckpoint();
    await this.markRunStatus("awaiting_user", {
      plan: proposedPlan,
      awaitingUser: { type: "plan_approval", planId: proposedPlan.planId },
    });
    this.emit("done", {
      summary: proposedPlan.summary,
      plan: proposedPlan,
      planProposed: true,
      awaiting: true,
    });
    return {
      ok: true,
      summary: proposedPlan.summary,
      steps: 0,
      toolsUsed,
    };
  }

  private async finishClarify(
    message: string,
    steps: number,
    toolsUsed: string[],
  ): Promise<{ ok: boolean; summary: string; steps: number; toolsUsed: string[] }> {
    const text = message.trim();
    if (!text) {
      return {
        ok: false,
        summary: "Não foi possível gerar a pergunta de esclarecimento.",
        steps,
        toolsUsed,
      };
    }
    this.emit("assistant_text", { text, final: true });
    this.emit("gate_decision", {
      phase: "clarify",
      reason: "clarify tool",
      awaiting: true,
    });
    await this.persistFinal(text, {
      awaiting: true,
      awaitingKind: "clarify",
    });
    await this.clearCheckpoint();
    await this.markRunStatus("awaiting_user", {
      awaitingUser: { type: "clarify", message: text.slice(0, 200) },
    });
    this.emit("done", { summary: text, qualified: true, awaiting: true });
    return { ok: true, summary: text, steps, toolsUsed };
  }

  private buildPlanModeInstruction(): string {
    return buildPlanModeTurnInstruction(this.originalUserRequest ?? "");
  }

  private buildAgentSystemPrompt(planMode: boolean, skillPrompt: string): string {
    return buildForgeAgentSystemInput({
      planMode,
      projectTemplate: this.projectTemplate,
      stackAddon: this.stackAddon,
      skillPrompt,
      sessionAddon: this.sessionAddon,
      antiLeakRule: ANTI_LEAK_RULE,
      tasteStart: this.tasteStart,
    });
  }

  private async runPlanModeAgentTurn(model: LLMProvider): Promise<{
    ok: boolean;
    summary: string;
    steps: number;
    toolsUsed: string[];
    error?: string;
  }> {
    const MAX_PLAN_EXPLORE = 10;
    const toolsUsed = new Set<string>();

    this.emit("phase", {
      phase: "plan",
      message: "Explorando projeto antes do plano…",
      intent: this.state.intent ?? undefined,
    });
    await this.saveCheckpoint(LoopPhase.PLAN_MODE);

    for (let step = 0; step < MAX_PLAN_EXPLORE; step++) {
      if (this.loopBudgetExceeded()) {
        const chunk = await this.returnResumableChunk(step, toolsUsed);
        return {
          ok: false,
          summary: chunk.error,
          steps: chunk.steps,
          toolsUsed: chunk.toolsUsed,
          error: chunk.error,
        };
      }

      const compressed = await this.compression.compress(this.state.messages);
      let response: ChatResponse | null = null;
      try {
        response = await this.llmChatPlanMode(
          model,
          step === 0 ? this.buildPlanModeInstruction() : "Continue explorando ou proponha o plano.",
          compressed,
        );
      } catch (err: unknown) {
        const message = friendlyLlmError(err, this.robinActive);
        return await this.finishPlanModeFailure(message, step, [...toolsUsed], message);
      }
      if (!response) {
        return await this.finishPlanModeFailure(
          "Sem resposta do modelo.",
          step,
          [...toolsUsed],
          "Sem resposta do modelo.",
        );
      }

      const assistantText = (response.content ?? "").trim();

      if (hasMixedMetaAndExecution(response.tool_calls)) {
        this.state.messages.push({
          role: "assistant",
          content: response.content ?? assistantText,
          tool_calls: response.tool_calls?.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        });
        this.state.messages.push({
          role: "user",
          content:
            "Não misture clarify/create_plan com ferramentas de exploração no mesmo turno. " +
            "Use só clarify OU só fs_read/fs_search/shell_exec.",
        });
        continue;
      }

      const { clarify: clarifyCall, createPlan: planCall, execution: execCalls } = splitMetaToolCalls(
        response.tool_calls ?? [],
      );

      if (planCall) {
        toolsUsed.add("create_plan");
        this.emit("phase", { phase: "creating_plan", message: "Criando plano…" });
        const proposed = proposedPlanFromToolArgs(planCall.arguments);
        if (!proposed) {
          return await this.finishPlanModeFailure(
            "create_plan inválido — faltam summary ou steps.",
            step,
            [...toolsUsed],
            "create_plan inválido",
          );
        }
        return await this.finishPlanProposal(proposed, [...toolsUsed]);
      }

      if (clarifyCall && execCalls.length === 0) {
        toolsUsed.add("clarify");
        const clarifyMsg = formatClarifyMessage(clarifyCall.arguments);
        const combined = [assistantText, clarifyMsg].filter(Boolean).join("\n\n").trim();
        return await this.finishClarify(combined, step, [...toolsUsed]);
      }

      if (!response.tool_calls?.length) {
        if (assistantText) {
          if (isPlanShapedMarkdown(assistantText)) {
            this.emit("phase", { phase: "creating_plan", message: "Criando plano…" });
            const toolArgs = planToolArgsFromMarkdown(assistantText);
            const proposed = toolArgs ? proposedPlanFromToolArgs(toolArgs) : null;
            if (proposed) {
              return await this.finishPlanProposal(proposed, [...toolsUsed]);
            }
            return await this.finishPlanModeFailure(
              "Plano no chat inválido — use create_plan com 2–7 passos.",
              step,
              [...toolsUsed],
              "plan_markdown_invalid",
            );
          }

          const clean = sanitizeUserFacingProse(assistantText);
          this.emit("assistant_text", { text: clean, final: true });
          await this.persistFinal(clean, { lastFinishOk: true, conversational: true });
          await this.clearCheckpoint();
          await this.markRunStatus("completed");
          this.emit("done", { summary: clean, conversational: true });
          return { ok: true, summary: clean, steps: step, toolsUsed: [...toolsUsed] };
        }
        return await this.finishPlanModeFailure(
          "Use clarify, create_plan ou ferramentas de exploração.",
          step,
          [...toolsUsed],
          "Resposta sem tool nem texto",
        );
      }

      const patchCalls = execCalls.filter((c) => isPlanModePatchTool(c.name));
      if (patchCalls.length > 0) {
        this.state.messages.push({
          role: "assistant",
          content: response.content ?? assistantText,
          tool_calls: response.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        });
        this.state.messages.push({
          role: "user",
          content:
            "Modo Plan: fs_write, fs_edit e fs_delete estão bloqueados. " +
            "Use fs_read, fs_search, fs_list ou shell_exec (grep, cat, ls) para explorar.",
        });
        continue;
      }

      this.toolsInvoked = true;
      this.emit("phase", { phase: "plan", message: "Explorando…", toolCount: execCalls.length });

      const execResults = await parallelExecute(execCalls, async (call) => {
        toolsUsed.add(call.name);
        this.emit("tool_start", { name: call.name, args: call.arguments });
        const result = await this.reg.execute(call);
        this.emit("tool_done", {
          name: call.name,
          ok: result.ok,
          error: result.error,
          summary: result.ok ? "ok" : (result.error ?? "erro"),
        });
        return result;
      });

      this.state.messages.push({
        role: "assistant",
        content: response.content ?? assistantText,
        tool_calls: execCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });

      for (const { call, result } of execResults) {
        this.state.messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 8000),
        });
      }
    }

    return await this.finishPlanModeFailure(
      "Limite de exploração no modo Plan — tente create_plan ou clarify.",
      MAX_PLAN_EXPLORE,
      [...toolsUsed],
      "plan_explore_limit",
    );
  }

  private async llmChatPlanMode(
    model: LLMProvider,
    instruction: string,
    history: ChatMessage[],
  ): Promise<ChatResponse | null> {
    const contextBlock = this.state.context
      ? `## Contexto do Projeto\n${this.state.context.projectConfig}\n\n## Arquivos\n${this.state.context.manifest}`
      : "(projeto novo)";
    const skillPrompt = this.state.context
      ? this.skills.buildSkillPrompt(this.state.context.files)
      : "";
    const fullSystemPrompt = this.buildAgentSystemPrompt(true, skillPrompt);

    return model.chat({
      messages: [
        { role: "system", content: fullSystemPrompt },
        { role: "system", content: contextBlock },
        ...history,
        { role: "user", content: instruction },
      ],
      tools: mergePlanModeToolDefinitions(this.reg.getDefinitions()),
      tool_choice: "auto",
      max_tokens: 4096,
    });
  }

  /**
   * Atualiza agent_runs.status e meta. Best-effort.
   * Status possíveis: running, completed, awaiting_user.
   * Em plan mode, marca a run como completed com `plan` em meta.
   */
  private async markRunStatus(
    status: "running" | "completed" | "awaiting_user",
    extra?: {
      plan?: ProposedPlan | null;
      awaitingUser?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!this.runId) return;
    try {
      const { data: existing } = await this.sb
        .from("agent_runs")
        .select("meta")
        .eq("id", this.runId)
        .maybeSingle();
      const prevMeta = (existing?.meta ?? {}) as Record<string, unknown>;
      const nextMeta: Record<string, unknown> = {
        ...prevMeta,
        planMode: this.planMode,
      };
      if (extra && Object.prototype.hasOwnProperty.call(extra, "plan")) {
        if (extra.plan === null) {
          delete nextMeta.plan;
        } else if (extra.plan) {
          nextMeta.plan = extra.plan;
        }
      }
      if (extra?.awaitingUser) {
        nextMeta.awaitingUser = extra.awaitingUser;
      }
      const updateFields: Record<string, unknown> = { status, meta: nextMeta };
      if (status === "awaiting_user") {
        updateFields.finished_at = null;
      } else if (status === "completed" || status === "running") {
        updateFields.finished_at = new Date().toISOString();
      }
      await this.sb.from("agent_runs").update(updateFields).eq("id", this.runId);
    } catch (err) {
      logger.error("agent_run.mark_status_failed", {
        runId: this.runId,
        status,
        error: (err as Error)?.message,
      });
    }
  }

  private async runAdvisoryReply(): Promise<{
    ok: boolean;
    summary: string;
    steps: number;
    toolsUsed: string[];
  }> {
    const ctx = this.state.context
      ? `${this.state.context.projectConfig}\n\n${this.state.context.manifest}`.slice(0, 4000)
      : "";
    const reply = sanitizeUserFacingProse(
      await runAdvisoryPhase(this.configuredModel(), this.state.messages, {
        userRequest: this.originalUserRequest ?? undefined,
        projectContext: ctx,
      }),
    );
    this.emit("assistant_text", { text: reply, final: true });
    await this.persistFinal(reply, {
      lastFinishOk: true,
      conversational: true,
    });
    await this.clearCheckpoint();
    await this.markRunStatus("completed");
    this.emit("done", { summary: reply, conversational: true });
    return { ok: true, summary: reply, steps: 0, toolsUsed: [] };
  }

  private async runConversationalReply(): Promise<{
    ok: boolean;
    summary: string;
    steps: number;
    toolsUsed: string[];
  }> {
    const reply = sanitizeUserFacingProse(
      await runConversationalPhase(this.configuredModel(), this.state.messages, {
        planMode: this.planMode,
        userRequest: this.originalUserRequest ?? undefined,
      }),
    );
    this.emit("assistant_text", { text: reply, final: true });
    await this.persistFinal(reply, {
      lastFinishOk: true,
      conversational: true,
    });
    await this.clearCheckpoint();
    await this.markRunStatus("completed");
    this.emit("done", { summary: reply, conversational: true });
    return { ok: true, summary: reply, steps: 0, toolsUsed: [] };
  }

  private async runInventoryPhase(model: LLMProvider): Promise<string> {
    this.emit("phase", {
      phase: "inventory",
      message: "Resumindo estado do projeto…",
    });
    const ctx = this.state.context?.projectConfig?.slice(0, 4000) ?? "(sem arquivos)";
    const manifest = this.state.context?.manifest?.slice(0, 2000) ?? "";
    try {
      const resp = await model.chat({
        messages: [
          {
            role: "system",
            content: `${INVENTORY_SYSTEM}\n\n${ANTI_LEAK_RULE}`,
          },
          {
            role: "user",
            content: `Contexto de arquivos:\n${ctx}\n\nLista:\n${manifest}`,
          },
        ],
        max_tokens: 900,
        temperature: 0.2,
      });
      const text = (resp.content ?? "").trim();
      if (text.length >= 12) return text;
      const retry = await model.chat({
        messages: [
          { role: "system", content: `${INVENTORY_SYSTEM}\n\n${ANTI_LEAK_RULE}` },
          {
            role: "user",
            content: `Contexto de arquivos:\n${ctx}\n\nLista:\n${manifest}\n\nResuma o estado do projeto em linguagem natural.`,
          },
        ],
        max_tokens: 900,
        temperature: 0.35,
      });
      return (retry.content ?? "").trim();
    } catch {
      return "";
    }
  }

  /** @returns true quando esgotou tentativas — caller deve finalizar a run. */
  private applyNoToolCallsEnforcement(
    response: ChatResponse,
    assistantText: string,
    _loopStep: number,
  ): boolean {
    const decision = decideToolProgress({
      hasToolCalls: false,
      missCount: this.toolMissCount,
      wasStreamed: this.llmResponseWasStreamed,
    });
    if (decision.kind === "fail") {
      this.emit("explore", { message: decision.exploreMessage });
      this.emit("error", { message: decision.userMessage, recoverable: false });
      return true;
    }

    this.toolMissCount = decision.attempt;
    this.forceToolsNext = decision.forceToolsNext;
    this.emit("explore", { message: decision.exploreMessage });

    const historyContent = assistantContentForHistory(
      response.content,
      assistantText,
      this.narrationBuffer,
      this.llmResponseWasStreamed,
    );
    if (assistantText.trim()) {
      this.emitAgentProse(assistantText);
    }

    this.state.messages.push({
      role: "assistant",
      content: historyContent,
    });
    this.state.messages.push({
      role: "user",
      content: decision.userNudge,
    });
    return false;
  }

  private async llmChat(
    model: LLMProvider,
    instruction: string,
    history: ChatMessage[],
    forceTools = false,
    tools?: ToolDefinition[],
  ): Promise<ChatResponse | null> {
    const contextBlock = this.state.context
      ? `## Contexto do Projeto\n${this.state.context.projectConfig}\n\n## Arquivos\n${this.state.context.manifest}`
      : "(projeto novo)";
    const skillPrompt = this.state.context
      ? this.skills.buildSkillPrompt(this.state.context.files)
      : "";
    const fullSystemPrompt = this.buildAgentSystemPrompt(false, skillPrompt);

    const messages: ChatMessage[] = [
      { role: "system", content: fullSystemPrompt },
      { role: "system", content: contextBlock },
      ...history,
      { role: "user", content: instruction },
    ];

    this.llmResponseWasStreamed = false;
    this.thinkingStreamStartedAt = null;
    try {
      return await model.chat({
        messages,
        tools: tools ?? mergeExecutionToolDefinitions(this.reg.getDefinitions(), false),
        tool_choice: forceTools ? "required" : "auto",
        max_tokens: 4096,
        onTokenDelta: forceTools
          ? undefined
          : (delta) => {
              if (!delta) return;
              if (this.thinkingStreamStartedAt == null) {
                this.thinkingStreamStartedAt = Date.now();
              }
              const elapsed = Date.now() - this.thinkingStreamStartedAt;
              if (elapsed > THINKING_STREAM_CAP_MS) {
                this.forceToolsNext = true;
                return;
              }
              this.llmResponseWasStreamed = true;
              this.lastActivityAt = Date.now();
              this.emit("assistant_text", {
                text: delta,
                append: true,
                delta: true,
                final: false,
                thinking: true,
              });
            },
      });
    } catch (err: unknown) {
      const message = friendlyLlmError(err, this.robinActive);
      this.emit("error", { message, recoverable: true });
      throw new Error(message);
    }
  }

  private appendResumeInstruction(): void {
    const last = this.state.messages[this.state.messages.length - 1];
    if (last?.role === "user") return;
    this.state.messages.push({
      role: "user",
      content:
        "[Retomar] Continue a tarefa a partir do estado atual do projeto e do histórico acima. " +
        "Não recomece do zero; use os arquivos já criados ou alterados.",
    });
  }

  private async isCanceled(): Promise<boolean> {
    if (!this.runId) return false;
    const { data } = await this.sb
      .from("agent_runs")
      .select("canceled_at")
      .eq("id", this.runId)
      .maybeSingle();
    return !!data?.canceled_at;
  }

  private async persistAssistantStep(response: ChatResponse): Promise<string | null> {
    const tool_calls = (response.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.name,
      args: tc.arguments,
      status: "running",
    }));
    const meta: Record<string, unknown> = {
      runId: this.runId ?? undefined,
      step: this.state.currentStepIndex,
      partial: true,
    };
    const stepText = (response.content ?? "").trim();

    const existingId = await this.resolveExistingRunMessageId();
    if (existingId) {
      let parts: Array<{ type: string; text: string }> = [];
      if (stepText) {
        const { data: existing } = await this.sb
          .from("messages")
          .select("parts")
          .eq("id", existingId)
          .maybeSingle();
        const prevParts =
          (existing as { parts?: Array<{ type?: string; text?: string }> } | null)?.parts ?? [];
        const prevText = prevParts
          .filter((p) => p?.type === "text" && typeof p.text === "string")
          .map((p) => p.text!.trim())
          .filter(Boolean)
          .join("\n\n");
        const merged = [prevText, stepText].filter(Boolean).join("\n\n");
        parts = merged ? [{ type: "text", text: merged }] : [];
      }
      await this.sb
        .from("messages")
        .update({
          ...(parts.length > 0 ? { parts } : {}),
          tool_calls,
          meta,
        })
        .eq("id", existingId);
      return existingId;
    }

    const { data } = await this.sb
      .from("messages")
      .insert({
        conversation_id: this.state.conversationId,
        role: "assistant",
        parts: stepText ? [{ type: "text", text: stepText }] : [],
        tool_calls,
        meta,
      })
      .select("id")
      .single();
    const id = data?.id ?? null;
    if (id) this.lastRunMessageId = id;
    return id;
  }

  private async resolveExistingRunMessageId(): Promise<string | null> {
    if (this.lastRunMessageId) return this.lastRunMessageId;
    if (!this.runId) return null;
    try {
      const query = this.sb
        .from("messages")
        .select("id")
        .eq("conversation_id", this.state.conversationId)
        .eq("role", "assistant");
      const filtered =
        typeof query.filter === "function" ? query.filter("meta->>runId", "eq", this.runId) : query;
      const ordered =
        typeof filtered.order === "function"
          ? filtered.order("created_at", { ascending: false })
          : filtered;
      const limited = typeof ordered.limit === "function" ? ordered.limit(1) : ordered;
      const { data: existing } = await limited.maybeSingle();
      const id = (existing as { id?: string } | null)?.id ?? null;
      if (id) this.lastRunMessageId = id;
      return id;
    } catch {
      return null;
    }
  }

  private async updateAssistantStep(
    msgId: string,
    response: ChatResponse,
    execResults: Array<{ call: any; result: any }>,
    step: number,
  ): Promise<void> {
    const tool_calls = (response.tool_calls ?? []).map((tc) => {
      const found = execResults.find((r) => r.call.id === tc.id);
      return {
        id: tc.id,
        name: tc.name,
        args: tc.arguments,
        status: found?.result.ok ? "ok" : "error",
        error: found?.result.error ?? null,
        artifacts: found?.result.artifacts ?? [],
      };
    });
    const meta = buildExecutionLogMeta(null, this.state.executionLog, step);
    await this.sb.from("messages").update({ tool_calls, meta }).eq("id", msgId);
  }

  private toolsFromTimeline(
    timeline: Array<{ type: string; data: Record<string, unknown> }>,
  ): Array<{ name: string; args: Record<string, unknown>; ok?: boolean; error?: string }> {
    const tools: Array<{
      name: string;
      args: Record<string, unknown>;
      ok?: boolean;
      error?: string;
    }> = [];
    for (const ev of timeline) {
      if (ev.type === "tool_start") {
        tools.push({
          name: typeof ev.data.name === "string" ? ev.data.name : "?",
          args: (ev.data.args as Record<string, unknown> | undefined) ?? {},
        });
        continue;
      }
      if (ev.type === "tool_done") {
        const toolName = typeof ev.data.name === "string" ? ev.data.name : "?";
        for (let i = tools.length - 1; i >= 0; i--) {
          if (tools[i].name === toolName && tools[i].ok === undefined) {
            tools[i] = {
              ...tools[i],
              ok: ev.data.ok === true,
              error: typeof ev.data.error === "string" ? ev.data.error : undefined,
            };
            break;
          }
        }
      }
    }
    return tools;
  }

  private diffsFromTimeline(
    timeline: Array<{ type: string; data: Record<string, unknown>; timestamp?: number }>,
  ): Array<{
    id: string;
    path: string;
    before: string;
    after: string;
    op: "write" | "edit";
    timestamp: number;
  }> {
    const diffs: Array<{
      id: string;
      path: string;
      before: string;
      after: string;
      op: "write" | "edit";
      timestamp: number;
    }> = [];
    for (const ev of timeline) {
      if (ev.type !== "file_diff") continue;
      const path = typeof ev.data.path === "string" ? ev.data.path : "unknown";
      const before = typeof ev.data.before === "string" ? ev.data.before : "";
      const after = typeof ev.data.after === "string" ? ev.data.after : "";
      const op = ev.data.op === "edit" ? "edit" : "write";
      const ts = typeof ev.timestamp === "number" ? ev.timestamp : Date.now();
      diffs.push({
        id: `${path}::${diffs.length}::${ts}`,
        path,
        before,
        after,
        op,
        timestamp: ts,
      });
    }
    return diffs;
  }

  private latencyThoughtMsFromTimeline(
    timeline: Array<{ type: string; data?: Record<string, unknown>; timestamp: number }>,
  ): number | null {
    const first = timeline.find(
      (e) =>
        e.type === "assistant_text" &&
        typeof e.data?.text === "string" &&
        String(e.data.text).trim().length > 0,
    );
    if (!first) return null;
    return Math.max(500, first.timestamp - this.runStartTime);
  }

  private buildCardSnapshot(opts: {
    streamText: string;
    deliveryFiles: string[];
    finished?: boolean;
    lastFinishOk?: boolean | null;
    awaiting?: boolean;
    awaitingKind?: "clarify" | "plan_approval" | null;
    pendingPlan?: ProposedPlan | null;
    conversational?: boolean;
    phase?: string | null;
    currentStep?: number | null;
    totalSteps?: number | null;
    error?: string | null;
    resumable?: boolean;
  }): Record<string, unknown> {
    const timeline = this.streamTailBuffer.slice();
    const tools = this.toolsFromTimeline(timeline);
    const diffs = this.diffsFromTimeline(timeline);
    const finished = opts.finished ?? true;
    const lastFinishOk = opts.lastFinishOk ?? (finished ? true : null);
    const narration = this.narrationBuffer.trim();
    let latencyThoughtMs = this.latencyThoughtMsFromTimeline(timeline);
    if (latencyThoughtMs == null && (opts.finished ?? true)) {
      latencyThoughtMs = Math.max(500, Date.now() - this.runStartTime);
    }

    const snapshot: Record<string, unknown> = {
      timeline,
      tools,
      diffs,
      streamText: opts.streamText,
      narrationText: narration || undefined,
      latencyThoughtMs: latencyThoughtMs ?? undefined,
      phase: opts.phase ?? (finished ? "done" : null),
      message: null,
      summary: null,
      error: opts.error ?? null,
      finished,
      resumable: opts.resumable ?? false,
      lastFinishOk,
      currentStep: opts.currentStep ?? this.state.currentStepIndex,
      totalSteps: opts.totalSteps ?? this.maxStepsLimit,
      deliveryFiles: opts.deliveryFiles,
      buildLogLines: [],
      stackForkSuggested: null,
      awaiting: opts.awaiting ?? false,
      awaitingKind: opts.awaitingKind ?? null,
      conversational: opts.conversational === true,
    };

    if (opts.pendingPlan) {
      const plan = opts.pendingPlan;
      snapshot.pendingPlan = {
        planId: plan.planId,
        summary: plan.summary,
        rationale: plan.rationale ?? undefined,
        markdown: plan.markdown ?? undefined,
        mission: plan.mission ?? undefined,
        objective: plan.objective ?? undefined,
        steps: plan.steps,
        ttlMs: Number.MAX_SAFE_INTEGER,
        proposedAt: Date.now(),
        runId: this.runId,
        projectId: this.state.projectId,
      };
      snapshot.planSummary = plan.summary;
    }

    return snapshot;
  }

  private async persistCheckpointChat(steps: number, buildFix?: boolean): Promise<void> {
    const buildFixFlag = buildFix === true;
    const text = checkpointChatText(this.narrationBuffer, buildFixFlag);
    const deliveryFiles = [...this.touchedPaths];
    const cardSnapshot = this.buildCardSnapshot({
      streamText: text,
      deliveryFiles,
      finished: false,
      lastFinishOk: null,
      resumable: true,
      phase: this.state.phase,
      currentStep: steps,
    });
    const meta: Record<string, unknown> = {
      runId: this.runId ?? undefined,
      partial: false,
      checkpoint: true,
      betweenChunks: true,
      resumable: true,
      buildFix: buildFixFlag || undefined,
      deliveryFiles,
      executionLog: this.state.executionLog,
      finishedAt: new Date().toISOString(),
      currentStep: steps,
      totalSteps: this.maxStepsLimit,
      streamTail: this.streamTailBuffer.slice(-120),
      cardSnapshot,
      latencyThoughtMs:
        typeof cardSnapshot.latencyThoughtMs === "number"
          ? cardSnapshot.latencyThoughtMs
          : undefined,
      narrationText:
        typeof cardSnapshot.narrationText === "string" ? cardSnapshot.narrationText : undefined,
    };

    const existingId = await this.resolveExistingRunMessageId();
    if (existingId) {
      await this.sb
        .from("messages")
        .update({
          parts: [{ type: "text", text }],
          tool_calls: [],
          meta,
        })
        .eq("id", existingId);
      await this.sb
        .from("projects")
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq("id", this.state.projectId);
      return;
    }

    const { data } = await this.sb
      .from("messages")
      .insert({
        conversation_id: this.state.conversationId,
        role: "assistant",
        parts: [{ type: "text", text }],
        tool_calls: [],
        meta,
      })
      .select("id")
      .single();
    const id = data?.id ?? null;
    if (id) this.lastRunMessageId = id;
    await this.sb
      .from("projects")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", this.state.projectId);
  }

  private async persistFinal(
    summary: string,
    opts?: {
      lastFinishOk?: boolean;
      buildFailed?: boolean;
      awaiting?: boolean;
      awaitingKind?: "clarify" | "plan_approval" | null;
      conversational?: boolean;
    },
  ): Promise<void> {
    const conversational = opts?.conversational === true;
    const deliveryFiles = [...this.touchedPaths];
    const closing = summary.trim();
    const text = conversational ? closing : closing;
    const lastFinishOk = opts?.lastFinishOk ?? true;
    const cardSnapshot = this.buildCardSnapshot({
      streamText: text,
      deliveryFiles,
      finished: true,
      lastFinishOk,
      awaiting: opts?.awaiting,
      awaitingKind: opts?.awaitingKind,
      conversational,
      phase: opts?.awaiting ? null : "done",
    });
    const meta: Record<string, unknown> = {
      runId: this.runId ?? undefined,
      partial: false,
      conversational: conversational || undefined,
      deliveryFiles,
      executionLog: this.state.executionLog,
      finishedAt: new Date().toISOString(),
      currentStep: this.state.currentStepIndex,
      totalSteps: this.maxStepsLimit,
      lastFinishOk,
      buildFailed: opts?.buildFailed === true || lastFinishOk === false,
      streamTail: this.streamTailBuffer.slice(-120),
      cardSnapshot,
      latencyThoughtMs:
        typeof cardSnapshot.latencyThoughtMs === "number"
          ? cardSnapshot.latencyThoughtMs
          : undefined,
      narrationText:
        typeof cardSnapshot.narrationText === "string" ? cardSnapshot.narrationText : undefined,
    };

    const existingId = await this.resolveExistingRunMessageId();
    if (existingId) {
      await this.sb
        .from("messages")
        .update({
          parts: [{ type: "text", text }],
          tool_calls: [],
          meta,
        })
        .eq("id", existingId);
      await this.sb
        .from("projects")
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq("id", this.state.projectId);
      return;
    }

    await this.sb.from("messages").insert({
      conversation_id: this.state.conversationId,
      role: "assistant",
      parts: [{ type: "text", text }],
      tool_calls: [],
      meta,
    });
    await this.sb
      .from("projects")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", this.state.projectId);
  }

  private async persistPlanFinal(summary: string, plan: ProposedPlan): Promise<void> {
    const cardSnapshot = this.buildCardSnapshot({
      streamText: summary,
      deliveryFiles: [],
      finished: true,
      lastFinishOk: true,
      awaiting: true,
      awaitingKind: "plan_approval",
      pendingPlan: plan,
      phase: null,
    });
    const meta: Record<string, unknown> = {
      runId: this.runId ?? undefined,
      partial: false,
      projectId: this.state.projectId,
      planMode: true,
      planStatus: "pending",
      planId: plan.planId,
      planSummary: plan.summary,
      planRationale: plan.rationale ?? null,
      planMission: plan.mission ?? null,
      planObjective: plan.objective ?? null,
      planMarkdown: plan.markdown ?? null,
      planAssumptions: plan.assumptions ?? null,
      planOutOfScope: plan.outOfScope ?? null,
      planPhases: plan.phases ?? null,
      planSteps: plan.steps,
      finishedAt: new Date().toISOString(),
      cardSnapshot,
      latencyThoughtMs:
        typeof cardSnapshot.latencyThoughtMs === "number"
          ? cardSnapshot.latencyThoughtMs
          : undefined,
      narrationText:
        typeof cardSnapshot.narrationText === "string" ? cardSnapshot.narrationText : undefined,
    };

    const existingId = await this.resolveExistingRunMessageId();
    if (existingId) {
      await this.sb
        .from("messages")
        .update({
          parts: [{ type: "text", text: summary }],
          tool_calls: [],
          meta,
        })
        .eq("id", existingId);
      await this.sb
        .from("projects")
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq("id", this.state.projectId);
      return;
    }

    const { data } = await this.sb
      .from("messages")
      .insert({
        conversation_id: this.state.conversationId,
        role: "assistant",
        parts: [{ type: "text", text: summary }],
        tool_calls: [],
        meta,
      })
      .select("id")
      .single();
    const id = data?.id ?? null;
    if (id) this.lastRunMessageId = id;
    await this.sb
      .from("projects")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", this.state.projectId);
  }

  private enabledApprovedPlanSteps(): PlanStep[] {
    const enabled = this.approvedPlanSteps.filter((s) => s.enabled !== false);
    return enabled.length > 0 ? enabled : this.approvedPlanSteps;
  }

  private emitAgentProse(raw: string): void {
    const clean = sanitizeUserFacingProse(raw);
    if (!clean) return;
    this.streamNarration(clean);
    this.lastStepHadAgentProse = true;
  }

  private notifyLoopStatus(ctx: LoopUpdateContext): void {
    if (ctx.kind === "tool_batch" && this.lastStepHadAgentProse) {
      this.lastStepHadAgentProse = false;
      return;
    }
    const text = formatLoopStatus({
      ...ctx,
      userRequest: this.originalUserRequest ?? undefined,
      touchedPaths: [...this.touchedPaths],
    });
    if (!text) return;
    if (ctx.kind === "model_error") {
      this.streamNarration(text);
      return;
    }
    this.notifyExecution(text);
  }

  /** Progresso de execução — Inspector durante build pós-approve; chat nos demais modos. */
  private notifyExecution(text: string): void {
    if (this.approvedPlanBuild) {
      this.emitInspectorNote(text);
      return;
    }
    this.streamNarration(text);
  }

  private emitInspectorNote(message: string): void {
    const chunk = message.trim();
    if (!chunk) return;
    this.emit("phase", {
      phase: "checkpoint",
      message: chunk,
      task_title: chunk.slice(0, 120),
    });
  }

  /** Checkpoint de comunicação — chat só quando chatVisible; build aprovado usa Inspector por padrão. */
  private streamNarration(text: string, opts?: { append?: boolean; chatVisible?: boolean }): void {
    const chunk = text.trim();
    if (!chunk) return;
    if (isDuplicateNarrationChunk(this.narrationBuffer, chunk)) return;
    const chatVisible = this.approvedPlanBuild
      ? opts?.chatVisible === true
      : opts?.chatVisible !== false;
    if (!chatVisible) {
      this.emitInspectorNote(chunk);
      return;
    }
    this.appendToNarration(chunk);
    const shouldAppend = opts?.append ?? this.narrationStarted;
    this.emit("assistant_text", {
      text: shouldAppend ? `\n\n${chunk}` : chunk,
      append: shouldAppend,
      final: false,
      narration: true,
    });
    this.narrationStarted = true;
  }

  private emit(type: string, data: unknown): void {
    let payload = data;
    if (payload && typeof payload === "object") {
      const d = { ...(payload as Record<string, unknown>) };
      if (type === "phase" && typeof d.phase === "string") {
        d.task_title =
          d.task_title ??
          buildPhaseTaskTitle(
            String(d.phase),
            typeof d.message === "string" ? d.message : undefined,
          );
        payload = d;
      }
      if (type === "tool_start" && typeof d.name === "string") {
        const args = (d.args as Record<string, unknown> | undefined) ?? {};
        d.step_intent = d.step_intent ?? describeStepExpectation(String(d.name), args);
        d.task_phase = d.task_phase ?? this.state.phase;
        d.file_paths = d.file_paths ?? extractStepFilePaths(String(d.name), args);
        payload = d;
      }
      if (type === "validate_ok") {
        this.onStream({
          type: "step_result",
          data: {
            summary: typeof d.message === "string" ? d.message : "Build passou",
            evidence: ["Compilação OK", "Preview pronto para abrir"],
            ok: true,
          },
        });
      }
      if (type === "validate_fail") {
        this.onStream({
          type: "step_result",
          data: {
            summary: "Build falhou — corrigindo antes de entregar",
            evidence: [
              typeof d.feedback === "string"
                ? d.feedback.slice(0, 120)
                : typeof d.message === "string"
                  ? d.message.slice(0, 120)
                  : "Erro de compilação",
            ],
            ok: false,
          },
        });
      }
    }
    const timelineTypes = new Set([
      "phase",
      "explore",
      "memory",
      "classify",
      "skills",
      "tool_start",
      "tool_done",
      "step_result",
      "assistant_text",
      "validate_ok",
      "validate_fail",
      "delivery_checkpoint",
      "file_diff",
      "done",
      "finish",
      "timeout_warning",
      "heartbeat",
      "error",
      "stuck",
    ]);
    if (timelineTypes.has(type) && payload && typeof payload === "object") {
      this.streamTailBuffer.push({
        type,
        data: { ...(payload as Record<string, unknown>) },
        timestamp: Date.now(),
      });
      if (this.streamTailBuffer.length > 200) {
        this.streamTailBuffer.shift();
      }
    }

    this.onStream({ type, data: payload });
  }
}
