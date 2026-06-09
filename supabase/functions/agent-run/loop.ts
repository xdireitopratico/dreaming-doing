// loop.ts — AgentLoop definitivo.
// Model Router (cheap/main), Compression, Parallel Exec, Runtime Observer, Skills,
// persistência incremental de tool_calls (cada step vira uma message viva no chat).
import type {
  AgentState,
  ChatMessage,
  ChatResponse,
  FileEntry,
  IntentAnalysis,
  LLMProvider,
  PlanStep,
  ProposedPlan,
} from "./types.ts";
import { LoopPhase } from "./types.ts";

type RouterOverrides = { main?: LLMProvider; cheap?: LLMProvider };
import { ToolRegistry } from "./registry.ts";
import { ModelRouter } from "./router.ts";
import { CompressionManager, parallelExecute } from "./compression.ts";
import { RuntimeObserver } from "./observer.ts";
import { SkillRegistry } from "./skills.ts";
import {
  buildStackEnforcement,
  EXECUTE_RULES,
  getSystemPrompt,
} from "./prompts.ts";
import {
  ANTI_LEAK_RULE,
  buildExecuteInstruction,
  buildMobileStackQualifyMessage,
  extractOriginalUserRequest,
  INVENTORY_SYSTEM,
  isAmbiguousMobileRequest,
  isProjectInventoryQuestion,
  isProjectSeedPlaceholder,
  needsQualify,
  QUALIFY_SYSTEM,
} from "./qualify.ts";
import { getTasteStartSystemPrompt } from "./prompts-taste.ts";
import { friendlyLlmError } from "./llm-errors.ts";
import { hashToolBatch, isExecutionStuck } from "../_shared/agent-stuck.ts";
import { logger } from "../_shared/logger.ts";
import {
  appendExecutionLogEntry,
  buildExecutionLogMeta,
} from "./executionLogMeta.ts";
import {
  type CheckpointExtra,
  resumeStepStart,
  serializeCheckpointPayload,
} from "./checkpoint.ts";
import { buildProposedPlan, PLAN_APPROVAL_TTL_MS } from "./plan-mode.ts";
import type { ClassificationResult } from "./router.ts";
import {
  buildApprovedPlanBriefing,
  buildClassifyBriefing,
  buildFinalWrapUp,
  buildGatherNarration,
  buildObserveNarration,
  buildToolBatchNarration,
} from "./narration.ts";
import {
  buildPhaseTaskTitle,
  describeStepExpectation,
  extractStepFilePaths,
} from "../_shared/step-intent.ts";

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
    (typeof globalThis.Deno !== "undefined"
      ? Deno.env.get("AGENT_LOOP_BUDGET_MS")
      : undefined) ??
      (typeof process !== "undefined"
        ? process.env.AGENT_LOOP_BUDGET_MS
        : undefined);
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const inngest =
    (typeof process !== "undefined" && process.env.INNGEST_EXECUTOR === "1") ||
    (typeof globalThis.Deno !== "undefined" &&
      Deno.env.get("INNGEST_EXECUTOR") === "1");
  // Edge: ~90s; Inngest/Vercel step: ~4.5m (fits vercel maxDuration 300s).
  return inngest ? 270_000 : 90_000;
}

const LOOP_BUDGET_MS = resolveLoopBudgetMs();
function calculateMaxSteps(complexity: 1 | 2 | 3 | 4 | 5): number {
  return complexity * 5 + 5;
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
  private skipQualify: boolean;
  private approvedPlanSteps: PlanStep[];
  private narrationStarted: boolean;
  private narrationBuffer: string;
  private llmResponseWasStreamed: boolean;
  private touchedPaths: Set<string>;
  private lastActivityAt: number;
  private lastRunMessageId: string | null;
  private buildFixResume: boolean;
  private streamTailBuffer: Array<{
    type: string;
    data: Record<string, unknown>;
    timestamp: number;
  }>;
  /** Cache de conteúdo de arquivos para evitar N+1 queries ao Supabase durante execução */
  private fileContentCache: Map<string, string>;

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
      /** Explicit flag to bypass qualify/classify pollution paths for plan+follow-up (PR2). */
      skipQualify?: boolean;
      planSummary?: string;
      planSteps?: PlanStep[];
      /** Retomada após falha de build — pula re-narração de intenção. */
      buildFixResume?: boolean;
    },
  ) {
    this.reg = reg;
    this.llm = llm;
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
    this.skipQualify = options?.skipQualify ??
      (options?.approvedPlanBuild ?? false);
    this.approvedPlanSteps = options?.planSteps ?? [];
    const extracted = extractOriginalUserRequest(state.messages);
    const planSummary = options?.planSummary?.trim() ?? "";
    this.originalUserRequest = this.approvedPlanBuild && planSummary
      ? planSummary
      : extracted;
    this.toolsInvoked = false;
    this.narrationStarted = false;
    this.narrationBuffer = "";
    this.llmResponseWasStreamed = false;
    this.touchedPaths = new Set();
    this.lastActivityAt = Date.now();
    this.lastRunMessageId = null;
    this.buildFixResume = options?.buildFixResume ?? false;
    this.streamTailBuffer = [];
    this.fileContentCache = new Map();
    this.runStartTime = Date.now();
    this.lastCheckpointStep = options?.hasCheckpoint
      ? (state.currentStepIndex ?? 0)
      : 0;
    this.router = new ModelRouter(injectedKeys, routerOverrides);
    this.observer = new RuntimeObserver(reg);
    this.skills = new SkillRegistry();
    this.compression = new CompressionManager(
      this.router.getCheapProvider(),
      (type, data) => this.emit(type, data),
    );
  }

  private loopBudgetExceeded(): boolean {
    return Date.now() - this.runStartTime > LOOP_BUDGET_MS;
  }

  private requiresFinalBuildGate(): boolean {
    if (this.planMode || this.tasteStart) return false;
    if (this.touchedPaths.size > 0) return true;
    const webTemplates = [
      "vite-react",
      "nextjs-app-router",
      "tanstack-start",
      "astro",
    ];
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
    return {
      ok: false,
      error: options?.buildFix
        ? "Corrigindo erros de build…"
        : "Retomando automaticamente…",
      steps,
      resumable: true,
      buildFix: options?.buildFix === true,
      toolsUsed: [...toolsUsed],
    };
  }

  private appendToNarration(text: string): void {
    const chunk = text.trim();
    if (!chunk) return;
    this.narrationBuffer = this.narrationBuffer
      ? `${this.narrationBuffer}\n\n${chunk}`
      : chunk;
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
      const next = (typeof meta.llmRetries === "number" ? meta.llmRetries : 0) +
        1;
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
    this.streamNarration(
      "Ainda processando o modelo — já volto com a próxima entrega.",
    );
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
      message: deliveryFiles.length > 0
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
        message:
          "Próximo do limite de tempo da Edge Function — salvando checkpoint",
        elapsedMs: Date.now() - this.runStartTime,
      });
    }
    try {
      const extra: CheckpointExtra = {
        complexityScore: this.complexityScore,
        maxStepsLimit: this.maxStepsLimit,
      };
      await this.sb.from("agent_checkpoints").upsert({
        project_id: this.state.projectId,
        conversation_id: this.state.conversationId,
        phase,
        state: serializeCheckpointPayload(this.state, extra),
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id,conversation_id" });
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

  private async rollbackLastCommit(): Promise<void> {
    try {
      await this.reg.execute({
        id: crypto.randomUUID(),
        name: "shell_exec",
        arguments: {
          command: "cd /home/user && git reset --hard HEAD~1 2>&1 || true",
        },
      });
      this.emit("rollback", {
        message:
          "Rollback automático: último commit revertido após falha de build",
      });
    } catch {
      this.emit("rollback", {
        message: "Rollback falhou — sandbox pode não ter git",
      });
    }
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
    this.compression.reset();
    const toolsUsed = new Set<string>();
    let executionModel = this.router.selectModel(this.complexityScore);

    if (this.resumeRun && this.hasCheckpoint) {
      this.emit("phase", {
        phase: "resume",
        message:
          `Retomando do passo ${this.state.currentStepIndex}/${this.maxStepsLimit} ` +
          "(checkpoint restaurado — sem reclassificar)",
      });
      this.emit("memory", {
        message: `Checkpoint: ${this.state.messages.length} mensagens, fase ${
          this.resumePhase ?? this.state.phase
        }`,
        messageCount: this.state.messages.length,
      });
      this.emit("classify", {
        complexity: this.complexityScore,
        model: this.complexityScore <= 2
          ? this.router.cheapCfg.label
          : this.router.mainCfg.label,
        summary: this.state.intent?.summary ?? "Retomada",
        maxSteps: this.maxStepsLimit,
        restored: true,
      });
      this.streamNarration(
        this.buildFixResume
          ? "Corrigindo erros de build…"
          : `Retomando de onde parei (**passo ${this.state.currentStepIndex}/${this.maxStepsLimit}**).`,
      );

      // Plan runs terminate after proposing (no in-memory decision wait).
      // The plan is emitted to the client via Realtime; approval/rejection
      // creates a new build run via the plan-decide server action.
    } else {
      if (this.resumeRun) {
        this.appendResumeInstruction();
        this.emit("phase", {
          phase: "resume",
          message: "Retomando a partir do histórico salvo no chat…",
        });
      }

      this.emit("phase", {
        phase: "gather",
        message: "Lendo arquivos do projeto...",
      });
      this.emit("memory", {
        message:
          `Memória: ${this.state.messages.length} mensagens carregadas do projeto`,
        messageCount: this.state.messages.length,
      });
      await this.gatherContext();
      if (this.loopBudgetExceeded()) {
        return this.returnResumableChunk(0, toolsUsed);
      }
      await this.saveCheckpoint(LoopPhase.GATHER_CONTEXT);

      // Strong approvedPlanBuild / skipQualify short-circuit BEFORE classify + lastUserContent pop.
      // Uses planSummary (via originalUserRequest) + meta carried in history; avoids pollution on plan+follow-up.
      const isApprovedOrSkip = this.approvedPlanBuild || this.skipQualify;
      this.emit("phase", {
        phase: "classify",
        message: isApprovedOrSkip
          ? "Preparando execução do plano aprovado..."
          : "Classificando complexidade...",
      });
      let classification: ClassificationResult;
      if (isApprovedOrSkip) {
        classification = {
          complexity: (this.complexityScore || 3) as 1 | 2 | 3 | 4 | 5,
          type: "modify",
          summary: (this.originalUserRequest || "Executar plano aprovado")
            .slice(0, 200),
          needsBuild: true,
          needsDeps: false,
        };
      } else {
        const lastUserContent = this.state.messages.filter((m) =>
          m.role === "user"
        ).pop()?.content ?? "";
        const userPrompt = typeof lastUserContent === "string"
          ? lastUserContent
          : "";
        classification = await this.router.classify(
          userPrompt,
          this.state.context?.projectConfig ?? "(vazio)",
        );
      }
      if (this.loopBudgetExceeded()) {
        return this.returnResumableChunk(0, toolsUsed);
      }
      this.complexityScore = classification.complexity;
      this.state.intent = {
        type: classification.type as IntentAnalysis["type"],
        summary: classification.summary,
        scope: [],
        complexity: classification.complexity <= 2
          ? "simple"
          : classification.complexity <= 4
          ? "medium"
          : "complex",
      };

      this.maxStepsLimit = calculateMaxSteps(classification.complexity);
      executionModel = this.router.selectModel(classification.complexity);
      this.emit("classify", {
        complexity: classification.complexity,
        model: classification.complexity <= 2
          ? this.router.cheapCfg.label
          : this.router.mainCfg.label,
        summary: classification.summary,
        maxSteps: this.maxStepsLimit,
      });

      this.emit("phase", {
        phase: this.planMode ? "plan" : "build",
        message: classification.summary,
        intent: this.state.intent,
      });

      const skipIntentNarration = this.buildFixResume;
      if (!skipIntentNarration) {
        if (this.planMode) {
          const planBriefing = buildClassifyBriefing(classification, {
            maxSteps: this.maxStepsLimit,
            planMode: true,
          });
          this.streamNarration(planBriefing);
        } else if (this.approvedPlanBuild) {
          this.streamNarration(
            buildApprovedPlanBriefing(
              this.originalUserRequest,
              this.approvedPlanSteps,
            ),
          );
        } else {
          this.streamNarration(
            buildClassifyBriefing(classification, {
              maxSteps: this.maxStepsLimit,
              planMode: false,
            }),
          );
        }
      }

      await this.saveCheckpoint(LoopPhase.CREATE_PLAN);

      const projectFiles = this.state.context?.files ?? [];
      const isSeedPlaceholder = isProjectSeedPlaceholder(projectFiles);

      // Inventário do projeto — responde com contexto real, sem fs_write nem qualify vago.
      if (
        this.originalUserRequest &&
        isProjectInventoryQuestion(this.originalUserRequest) &&
        !this.planMode
      ) {
        const inv = await this.runInventoryPhase(executionModel);
        this.emit("assistant_text", { text: inv, final: true });
        await this.persistFinal(inv);
        await this.clearCheckpoint();
        await this.markRunStatus("completed");
        this.emit("done", { summary: inv, inventory: true });
        return { ok: true, summary: inv, steps: 0, toolsUsed: [] };
      }

      // Build pós-approve: nunca qualify — executar plano aprovado.
      if (this.approvedPlanBuild) {
        this.emit("phase", {
          phase: "build",
          message: "Executando plano aprovado…",
        });
      }

      // Mobile ambíguo em Build — perguntar Expo vs Kotlin antes de codar.
      // Skip se o projeto já tem stack mobile configurado.
      const hasMobileTemplate = this.projectTemplate === "expo" ||
        this.projectTemplate === "android-native";
      if (
        !this.planMode &&
        !this.approvedPlanBuild &&
        !hasMobileTemplate &&
        this.originalUserRequest &&
        isAmbiguousMobileRequest(this.originalUserRequest)
      ) {
        const mobileQ = buildMobileStackQualifyMessage();
        this.emit("assistant_text", { text: mobileQ, final: true });
        this.emit("gate_decision", {
          phase: "qualify",
          reason: "ambiguous mobile request",
          awaiting: true,
        });
        await this.persistFinal(mobileQ);
        await this.clearCheckpoint();
        await this.markRunStatus("awaiting_user", {
          awaitingUser: { type: "qualify", message: mobileQ.slice(0, 200) },
        });
        this.emit("done", {
          summary: mobileQ,
          qualified: true,
          awaiting: true,
        });
        return { ok: true, summary: mobileQ, steps: 0, toolsUsed: [] };
      }

      // Qualify só em Plan — Build vai direto ao loop de ferramentas (estilo Lovable Agent).
      if (
        this.planMode &&
        this.originalUserRequest &&
        needsQualify(this.originalUserRequest, classification, {
          isSeedPlaceholder,
        })
      ) {
        const qualifyResult = await this.runQualifyPhase(
          executionModel,
          this.originalUserRequest,
        );
        if (qualifyResult.stopForUser) {
          const q = qualifyResult.message ||
            "Me conte mais sobre o que você quer construir.";
          this.emit("assistant_text", { text: q, final: true });
          this.emit("gate_decision", {
            phase: "qualify",
            reason:
              "needsQualify triggered (explicit interaction request or vague/short prompt)",
            awaiting: true,
          });
          await this.persistFinal(q);
          await this.clearCheckpoint();
          await this.markRunStatus("awaiting_user", {
            awaitingUser: { type: "qualify", message: q.slice(0, 200) },
          });
          this.emit("done", { summary: q, qualified: true, awaiting: true });
          return { ok: true, summary: q, steps: 0, toolsUsed: [] };
        }
      }

      // Plan mode: plano na Plan view + mensagem no chat; código só após aprovação.
      if (this.planMode) {
        const proposedPlan = this.proposePlan(classification);
        const planChatText = this.buildPlanChatMessage(proposedPlan);
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
        await this.persistPlanFinal(planChatText, proposedPlan);
        await this.saveCheckpoint(LoopPhase.CREATE_PLAN, true);
        await this.markRunStatus("completed", { plan: proposedPlan });
        this.emit("done", {
          summary: proposedPlan.summary,
          plan: proposedPlan,
          planProposed: true,
        });
        return {
          ok: true,
          summary: proposedPlan.summary,
          steps: 0,
          toolsUsed: [],
        };
      }
    }

    const step = this.resumeRun && this.hasCheckpoint
      ? resumeStepStart(
        this.resumePhase ?? this.state.phase,
        this.state.currentStepIndex,
      )
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
        this.state.totalSteps = this.maxStepsLimit;
        this.state.phase = LoopPhase.EXECUTE_STEP;
        await this.touchHeartbeat();
        this.emit("step", { current: loopStep, total: this.maxStepsLimit });
        this.emit("phase", {
          phase: "execute",
          message: `Executando passo ${loopStep}/${this.maxStepsLimit}…`,
        });

        const compressed = await this.compression.compress(this.state.messages);
        const executeInstruction = buildExecuteInstruction(
          this.originalUserRequest,
        );
        const actionableIntent = this.state.intent?.type === "modify" ||
          this.state.intent?.type === "new_project" ||
          this.state.intent?.type === "fix" ||
          this.state.intent?.type === "add_dep";
        const forceTools = !this.toolsInvoked && loopStep >= 2 &&
          loopStep <= 4 && actionableIntent;
        const narrationOnlyStep = !this.toolsInvoked && loopStep === 1 &&
          actionableIntent;
        let response: ChatResponse | null = null;
        try {
          this.maybeEmitSilenceHeartbeat();
          await this.touchHeartbeat();
          response = await this.llmChat(
            executionModel,
            executeInstruction,
            compressed,
            forceTools,
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Erro no modelo";
          const retries = await this.bumpLlmRetries();
          if (retries >= MAX_LLM_RETRIES) {
            const failMsg =
              `Erro no modelo após ${retries} tentativas: ${message}`;
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
          this.streamNarration(
            `Encontrei um problema no modelo (${message}) — vou tentar de novo em instantes.`,
          );
          return this.returnResumableChunk(loopStep, toolsUsed);
        }
        if (!response) break;

        await this.resetLlmRetries();
        this.compression.recordUsage(response.usage);

        const assistantText = (response.content ?? "").trim();
        if (assistantText && !this.llmResponseWasStreamed) {
          this.appendToNarration(assistantText);
          this.emit("assistant_text", {
            text: assistantText,
            append: this.narrationStarted,
            final: !response.tool_calls?.length,
          });
          this.narrationStarted = true;
        } else if (
          assistantText && this.llmResponseWasStreamed &&
          !this.narrationBuffer.includes(assistantText)
        ) {
          this.appendToNarration(assistantText);
        }

        // Sem tool_calls
        if (!response.tool_calls || response.tool_calls.length === 0) {
          if ((forceTools || narrationOnlyStep) && assistantText) {
            this.state.messages.push({
              role: "assistant",
              content: response.content ?? assistantText,
            });
            this.state.messages.push({
              role: "user",
              content:
                "Ótimo — agora use ferramentas (fs_read, fs_write, fs_edit ou shell_exec) para implementar. " +
                "Pode manter 1 frase curta de narração junto com as tool_calls.",
            });
            continue;
          }
          this.state.messages.push({
            role: "assistant",
            content: response.content ?? "Concluído.",
          });
          break;
        }

        this.toolsInvoked = true;

        this.emit("phase", {
          phase: "execute",
          toolCount: response.tool_calls.length,
        });
        await this.saveCheckpoint(LoopPhase.EXECUTE_STEP);

        // Persiste tool_calls IMEDIATAMENTE para o chat ver via Realtime,
        // enquanto eles ainda estão executando (com status pending).
        const liveMsgId = await this.persistAssistantStep(response);

        const execResults = await parallelExecute(
          response.tool_calls,
          async (call) => {
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

            if (
              call.name === "shell_exec" &&
              isGradleCommand(String(call.arguments.command ?? ""))
            ) {
              const output = typeof result.output === "string"
                ? result.output
                : result.output != null
                ? JSON.stringify(result.output)
                : result.error ?? "";
              this.emit("build_log", {
                command: String(call.arguments.command ?? "").slice(0, 240),
                lines: output.split("\n").map((l) => l.trim()).filter(Boolean)
                  .slice(-40),
                ok: result.ok,
                output: output.slice(0, 4000),
              });
            }

            // ─── Emite o diff para o cliente APÓS tool_done (com o estado final já aplicado) ───
            if (preDiff && result.ok) {
              this.recordTouchedPath(preDiff.path);
              this.emit("file_diff", preDiff);
              const hasGradleScaffold = (this.state.context?.files ?? []).some((
                f,
              ) =>
                /build\.gradle|settings\.gradle/i.test(
                  f.path.replace(/^\//, ""),
                )
              );
              if (
                isAndroidNativePath(preDiff.path) &&
                !hasGradleScaffold &&
                (this.projectTemplate === "vite-react" ||
                  this.projectTemplate === "landing-page")
              ) {
                this.emit("stack_fork_suggested", {
                  path: preDiff.path,
                  suggestedStack: "android-native",
                  message:
                    "Detectamos código **mobile nativo** neste projeto web. Quer criar um projeto Android dedicado? (O arquivo foi mantido — nada foi apagado.)",
                });
              }
            }

            if (
              (call.name === "fs_write" || call.name === "fs_edit") && result.ok
            ) {
              const pathArg = (call.arguments.path as string) ?? call.name;
              this.emit("preview_sync", { path: pathArg, reason: "fs_change" });
            }
            return result;
          },
        );

        // Git commit único por step (não por arquivo) — após todas as tools executarem
        const modifiedPaths = execResults
          .filter(({ call }) =>
            call.name === "fs_write" || call.name === "fs_edit"
          )
          .map(({ call }) => (call.arguments.path as string) ?? call.name)
          .filter(Boolean);
        if (modifiedPaths.length > 0) {
          const commitMsg = modifiedPaths.length === 1
            ? `${modifiedPaths[0]}: update`
            : `update ${modifiedPaths.length} files`;
          await this.reg.execute({
            id: crypto.randomUUID(),
            name: "shell_exec",
            arguments: {
              command:
                `cd /home/user && git add -A && git commit -m "${commitMsg}" 2>&1 || true`,
            },
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
          this.state.messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result).slice(0, 4000),
          });
        }

        const batchNarration = buildToolBatchNarration(
          response.tool_calls.map((tc) => ({
            name: tc.name,
            arguments: tc.arguments,
          })),
          {
            step: loopStep,
            total: this.maxStepsLimit,
            allOk: execResults.every(({ result }) => result.ok),
          },
        );
        if (batchNarration) this.streamNarration(batchNarration);

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
          response.tool_calls.map((tc) => ({
            name: tc.name,
            arguments: tc.arguments,
          })),
        );
        this.state.executionLog = appendExecutionLogEntry(
          this.state.executionLog,
          stepHash,
        );

        // Coleta arquivos modificados para type-check incremental
        const modifiedFilePaths = response.tool_calls
          .filter((t) => t.name === "fs_write" || t.name === "fs_edit")
          .map((t) => t.arguments.path as string)
          .filter(Boolean);

        // Atualiza a mensagem persistida com o resultado (status, error, output curto)
        if (liveMsgId) {
          await this.updateAssistantStep(
            liveMsgId,
            response,
            execResults,
            loopStep,
          );
        }

        // Quick TypeScript check incremental (rápido, apenas arquivos modificados)
        if (modifiedFilePaths.length > 0) {
          const typeCheck = await this.observer.quickTypeCheck(
            modifiedFilePaths,
          );
          if (!typeCheck.ok) {
            this.streamNarration(buildObserveNarration("typecheck"));
            this.emit("typecheck_fail", {
              errors: typeCheck.errors,
              files: modifiedFilePaths,
            });
            this.state.messages.push({
              role: "user",
              content: `TYPECHECK FALHOU nos arquivos modificados:\n\n${
                typeCheck.errors.map((e) =>
                  `${e.file}:${e.line}:${e.column} - ${e.code}: ${e.message}`
                ).join("\n")
              }\n\nCorrija os erros acima com fs_edit antes de continuar.`,
            });
            continue;
          }
        }

        const modifiedFiles = modifiedFilePaths.length > 0;
        if (modifiedFiles && buildAttempts < maxRetries) {
          this.state.phase = LoopPhase.VALIDATE_STEP;
          this.streamNarration(buildObserveNarration("build"));
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
              checks: observation.checks.filter((c) => !c.ok).map((c) =>
                c.name
              ),
              feedback: observation.feedback?.slice(0, 500),
            });
            // Rollback automático antes de pedir correção
            if (buildAttempts > 1) {
              await this.rollbackLastCommit();
            }
            this.state.messages.push({
              role: "user",
              content:
                `VERIFICAÇÃO FALHOU (${buildAttempts}/${maxRetries}). Analise e corrija:\n\n\`\`\`\n${
                  observation.feedback?.slice(0, 3000)
                }\n\`\`\`\n\nNÃO peça ajuda. Use fs_search/fs_edit para corrigir.`,
            });
            continue;
          } else {
            buildAttempts = 0;
            this.streamNarration(buildObserveNarration("validate_ok"));
            this.emit("validate_ok", { message: "Build OK" });
          }
        }

        if (isExecutionStuck(this.state.executionLog)) {
          this.streamNarration(buildObserveNarration("stuck"));
          this.emit("stuck", {
            message:
              "Padrão repetitivo detectado — injetando instrução para nova abordagem",
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
        this.streamNarration(buildObserveNarration("validate_ok"));
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
        const failMsg = `Build não passou após ${maxRetries} tentativas.\n\n` +
          `${
            finalObservation.feedback?.slice(0, 2000) ??
              "Erros de compilação no sandbox."
          }`;
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
          `\`\`\`\n${
            finalObservation.feedback?.slice(0, 3000) ?? ""
          }\n\`\`\`\n\n` +
          `Use fs_edit para corrigir imports (@forge/ui apenas) e erros de compilação.`,
      });
      this.streamNarration("Corrigindo erros de build antes de entregar…");
    }

    this.state.phase = LoopPhase.SUMMARIZE;
    this.emit("phase", { phase: "summarize", message: "Finalizando..." });
    await this.saveCheckpoint(LoopPhase.SUMMARIZE, true);
    const wrapUp = buildFinalWrapUp({
      stepsCompleted: loopStep,
      totalSteps: this.maxStepsLimit,
      touchedPaths: [...this.touchedPaths],
      toolsUsed: [...toolsUsed],
      resumable: false,
    });
    this.emit("assistant_text", {
      text: this.narrationStarted ? `\n\n${wrapUp}` : wrapUp,
      append: this.narrationStarted,
      final: true,
    });
    this.appendToNarration(wrapUp);
    this.narrationStarted = true;
    await this.persistFinal(wrapUp, { lastFinishOk: true });
    await this.clearCheckpoint();
    const tokens = this.compression.getTotalTokens();
    const costUsd = this.compression.getEstimatedCostUsd(
      this.router.mainCfg.model,
    );
    this.emit("done", {
      summary: wrapUp,
      totalInputTokens: tokens.input,
      totalOutputTokens: tokens.output,
      totalTokens: tokens.total,
      costUsd,
    });
    return {
      ok: true,
      summary: wrapUp,
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
      ].includes(f.path)
    );
    for (const f of keyFiles) {
      projectConfig += `\n### ${f.path}\n\`\`\`\n${
        (f.content ?? "").slice(0, 2000)
      }\n\`\`\`\n`;
    }

    if (fileList.length > 0) {
      const paths = keyFiles.map((f) => f.path);
      this.emit("explore", {
        totalFiles: fileList.length,
        paths,
        message: paths.length > 0
          ? `Lendo ${paths.join(", ")}…`
          : `Indexando ${fileList.length} arquivo${
            fileList.length === 1 ? "" : "s"
          }…`,
      });
      this.emit("phase", {
        phase: "gather",
        message: paths.length > 0
          ? `Explorando ${paths.length} arquivo${
            paths.length === 1 ? "" : "s"
          }-chave…`
          : `Explorando ${fileList.length} arquivo${
            fileList.length === 1 ? "" : "s"
          }…`,
      });
      this.streamNarration(buildGatherNarration(fileList.length, paths));
    } else {
      this.streamNarration(buildGatherNarration(0, []));
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

    this.state.context = {
      files: fileList,
      manifest: manifest || "(projeto vazio)",
      projectConfig: projectConfig ||
        "(projeto vazio — sem arquivos de configuração)",
      gitLog: "(não disponível ainda)",
      dbSchema: "(não disponível)",
      lastPlan: "nenhum",
    };
  }

  /**
   * Constrói um ProposedPlan rico a partir da resposta do classificador.
   * Usa a nova cadeia de prioridade:
   *  1) classification.plan (LLM estruturado: rationale + steps) — caminho preferencial
   *  2) rawContent (LLM seguiu parcialmente) — fallback robusto
   *  3) deriveDefaultPlan (heurística) — último recurso
   */
  private proposePlan(classification: ClassificationResult): ProposedPlan {
    return buildProposedPlan(classification, null, {
      planId: crypto.randomUUID(),
      ttlMs: PLAN_APPROVAL_TTL_MS,
      proposedAt: new Date().toISOString(),
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
      if (status === "completed" || status === "running") {
        updateFields.finished_at = new Date().toISOString();
      }
      await this.sb
        .from("agent_runs")
        .update(updateFields)
        .eq("id", this.runId);
    } catch (err) {
      logger.error("agent_run.mark_status_failed", {
        runId: this.runId,
        status,
        error: (err as Error)?.message,
      });
    }
  }

  private async runInventoryPhase(model: LLMProvider): Promise<string> {
    this.emit("phase", {
      phase: "qualify",
      message: "Resumindo estado do projeto…",
    });
    const ctx = this.state.context?.projectConfig?.slice(0, 4000) ??
      "(sem arquivos)";
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
      return (resp.content ?? "").trim() ||
        "Scaffold Vite+React pronto; `src/App.tsx` ainda é placeholder. Descreva o app em modo Build.";
    } catch {
      return "Scaffold Vite+React pronto; `src/App.tsx` ainda é placeholder. Descreva o app em modo Build.";
    }
  }

  private async runQualifyPhase(
    model: LLMProvider,
    userRequest: string,
  ): Promise<{ stopForUser: boolean; message: string }> {
    this.emit("phase", {
      phase: "qualify",
      message: "Qualificando ideia antes de codar…",
    });
    if (
      this.projectTemplate !== "expo" &&
      this.projectTemplate !== "android-native" &&
      isAmbiguousMobileRequest(userRequest)
    ) {
      return { stopForUser: true, message: buildMobileStackQualifyMessage() };
    }
    try {
      const resp = await model.chat({
        messages: [
          { role: "system", content: `${QUALIFY_SYSTEM}\n\n${ANTI_LEAK_RULE}` },
          {
            role: "user",
            content: `Pedido do usuário:\n${userRequest}\n\nContexto:\n${
              this.state.context?.projectConfig?.slice(0, 1500) ?? "(novo)"
            }`,
          },
        ],
        max_tokens: 800,
        temperature: 0.4,
      });
      const message = (resp.content ?? "").trim() ||
        "Ok — me conte em uma frase o que você quer construir e para quem.";
      return { stopForUser: true, message };
    } catch {
      return { stopForUser: false, message: "" };
    }
  }

  private async llmChat(
    model: LLMProvider,
    instruction: string,
    history: ChatMessage[],
    forceTools = false,
  ): Promise<ChatResponse | null> {
    const contextBlock = this.state.context
      ? `## Contexto do Projeto\n${this.state.context.projectConfig}\n\n## Arquivos\n${this.state.context.manifest}`
      : "(projeto novo)";
    const skillPrompt = this.state.context
      ? this.skills.buildSkillPrompt(this.state.context.files)
      : "";
    const base = getSystemPrompt(this.projectTemplate);
    const stackEnforcement = buildStackEnforcement(this.projectTemplate);
    const withStack = this.stackAddon ? `${base}\n\n${this.stackAddon}` : base;
    const withEnforcement = stackEnforcement
      ? `${withStack}\n\n${stackEnforcement}`
      : withStack;
    const tasteWrapped = this.tasteStart
      ? getTasteStartSystemPrompt(withEnforcement)
      : withEnforcement;
    const fullSystemPrompt = [
      tasteWrapped,
      skillPrompt,
      this.sessionAddon,
      EXECUTE_RULES,
      ANTI_LEAK_RULE,
    ].filter(Boolean).join("\n\n");

    const messages: ChatMessage[] = [
      { role: "system", content: fullSystemPrompt },
      { role: "system", content: contextBlock },
      ...history,
      { role: "user", content: instruction },
    ];

    this.llmResponseWasStreamed = false;
    try {
      return await model.chat({
        messages,
        tools: this.reg.getDefinitions(),
        tool_choice: forceTools ? "required" : "auto",
        max_tokens: 4096,
        onTokenDelta: forceTools ? undefined : (delta) => {
          if (!delta) return;
          this.llmResponseWasStreamed = true;
          this.emit("assistant_text", {
            text: delta,
            append: this.narrationStarted,
            delta: true,
            thinking: true,
            final: false,
          });
          this.narrationStarted = true;
          this.appendToNarration(delta);
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

  private async persistAssistantStep(
    response: ChatResponse,
  ): Promise<string | null> {
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
        const prevParts = (existing as
          | { parts?: Array<{ type?: string; text?: string }> }
          | null)?.parts ?? [];
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

    const { data } = await this.sb.from("messages").insert({
      conversation_id: this.state.conversationId,
      role: "assistant",
      parts: stepText ? [{ type: "text", text: stepText }] : [],
      tool_calls,
      meta,
    }).select("id").single();
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
      const filtered = typeof query.filter === "function"
        ? query.filter("meta->>runId", "eq", this.runId)
        : query;
      const ordered = typeof filtered.order === "function"
        ? filtered.order("created_at", { ascending: false })
        : filtered;
      const limited = typeof ordered.limit === "function"
        ? ordered.limit(1)
        : ordered;
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

  private buildPlanChatMessage(plan: ProposedPlan): string {
    return [
      `**${plan.summary}**`,
      "",
      "Abri o **plano completo** para você revisar (Missão, Objetivo, Fases e Fora do escopo).",
      "Edite se quiser e clique em **Aprovar e construir** quando estiver pronto.",
    ].join("\n");
  }

  private async persistFinal(
    summary: string,
    opts?: { lastFinishOk?: boolean; buildFailed?: boolean },
  ): Promise<void> {
    const narration = this.narrationBuffer.trim();
    const deliveryFiles = [...this.touchedPaths];
    const body = summary.trim() || narration.split("\n").slice(-1)[0]?.trim() ||
      summary;
    const fileFooter = deliveryFiles.length > 0
      ? `\n\n**Arquivos alterados:** ${
        deliveryFiles.map((p) => `\`${p}\``).join(", ")
      }`
      : "";
    const text = `${body}${fileFooter}`;
    const lastFinishOk = opts?.lastFinishOk ?? true;
    const meta: Record<string, unknown> = {
      runId: this.runId ?? undefined,
      partial: false,
      deliveryFiles,
      executionLog: this.state.executionLog,
      finishedAt: new Date().toISOString(),
      currentStep: this.state.currentStepIndex,
      totalSteps: this.maxStepsLimit,
      lastFinishOk,
      buildFailed: opts?.buildFailed === true || lastFinishOk === false,
      streamTail: this.streamTailBuffer.slice(-120),
    };

    const existingId = await this.resolveExistingRunMessageId();
    if (existingId) {
      await this.sb.from("messages").update({
        parts: [{ type: "text", text }],
        tool_calls: [],
        meta,
      }).eq("id", existingId);
      await this.sb.from("projects").update({
        updated_at: new Date().toISOString(),
      }).eq("id", this.state.projectId);
      return;
    }

    await this.sb.from("messages").insert({
      conversation_id: this.state.conversationId,
      role: "assistant",
      parts: [{ type: "text", text }],
      tool_calls: [],
      meta,
    });
    await this.sb.from("projects").update({
      updated_at: new Date().toISOString(),
    }).eq("id", this.state.projectId);
  }

  private async persistPlanFinal(
    summary: string,
    plan: ProposedPlan,
  ): Promise<void> {
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
    };

    const existingId = await this.resolveExistingRunMessageId();
    if (existingId) {
      await this.sb.from("messages").update({
        parts: [{ type: "text", text: summary }],
        tool_calls: [],
        meta,
      }).eq("id", existingId);
      await this.sb.from("projects").update({
        updated_at: new Date().toISOString(),
      }).eq("id", this.state.projectId);
      return;
    }

    const { data } = await this.sb.from("messages").insert({
      conversation_id: this.state.conversationId,
      role: "assistant",
      parts: [{ type: "text", text: summary }],
      tool_calls: [],
      meta,
    }).select("id").single();
    const id = data?.id ?? null;
    if (id) this.lastRunMessageId = id;
    await this.sb.from("projects").update({
      updated_at: new Date().toISOString(),
    }).eq("id", this.state.projectId);
  }

  /** Checkpoint de comunicação — alimenta streamText no chat (markdown acima do activity card). */
  private streamNarration(text: string, append?: boolean): void {
    const chunk = text.trim();
    if (!chunk) return;
    this.appendToNarration(chunk);
    const shouldAppend = append ?? this.narrationStarted;
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
        d.task_title = d.task_title ?? buildPhaseTaskTitle(
          String(d.phase),
          typeof d.message === "string" ? d.message : undefined,
        );
        payload = d;
      }
      if (type === "tool_start" && typeof d.name === "string") {
        const args = (d.args as Record<string, unknown> | undefined) ?? {};
        d.step_intent = d.step_intent ??
          describeStepExpectation(String(d.name), args);
        d.task_phase = d.task_phase ?? this.state.phase;
        d.file_paths = d.file_paths ??
          extractStepFilePaths(String(d.name), args);
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
      "done",
      "finish",
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
