// loop.ts — AgentLoop definitivo.
// Compression, Parallel Exec, Runtime Observer, Skills,
// persistência incremental de tool_calls (cada step vira uma message viva no chat).
// FSM integrada para validação de transições de estado (FORGE 2.0).
import type {
  AgentState,
  ChatMessage,
  ChatResponse,
  LLMProvider,
  DesignPlanField,
  PlanStep,
  ProposedPlan,
  ToolDefinition,
} from "./types.ts";
import { LoopPhase } from "./types.ts";

type RouterOverrides = { main?: LLMProvider; cheap?: LLMProvider };
import { ToolRegistry } from "./registry.ts";
import { ModelRouter } from "./router.ts";
import { CompressionManager } from "./compression.ts";
import { RuntimeObserver } from "./observer.ts";
import { SkillRegistry } from "./skills.ts";
import {
  resolveLoopOriginalUserRequest,
  resolveMaxStepsLimit,
  resolveSkipConversationalGate,
} from "./runtime/loop-init.ts";
import { buildOrchestratorDeps } from "./runtime/loop-orchestrator-deps.ts";

import type { AgentPreferencesPayload } from "./connector-keys.ts";
import type { LoopUpdateContext } from "./loop-status.ts";
import type { AgentStateData } from "./agent-fsm.ts";

import { emitLoopFsmTransition } from "./runtime/loop-fsm.ts";
import { notifyLoopStatusFromHost } from "./runtime/loop-notify.ts";
import { RuntimeEmitter, type StreamCallback } from "./runtime/emitter.ts";
import { createLoopBindings, type AgentLoopHost, type LoopBindings } from "./runtime/deps-factory.ts";
import { isRunCanceled, loopBudgetExceeded as loopBudgetExceededInfra } from "./runtime/infra.ts";
import { readLoopBudgetMsFromRuntime } from "./runtime/loop-config.ts";
import { runLlmChatForHost, type LlmChatHost } from "./runtime/llm-chat.ts";
import { runDesignPreflightIfNeeded as runDesignPreflightIfNeededPhase } from "./runtime/phases/design-preflight-phase.ts";
import { attemptGracefulClosingForHost } from "./runtime/phases/graceful-closing-host.ts";
import { runGatherContextForHost } from "./runtime/phases/gather-context.ts";
import { createAgentLoopMutableState } from "./runtime/loop-mutable-state.ts";
import { NarrationPhase } from "./runtime/phases/narration.ts";
import type { PlanModeStreamState } from "./runtime/phases/plan-turn.ts";
import { runChatModeAgentTurnForHost } from "./runtime/phases/chat-turn-host.ts";
import {
  finishPlanProposalForHost,
  runPlanModeAgentTurnForHost,
} from "./runtime/phases/plan-turn-host.ts";
import type { AgentLoopOptions } from "./runtime/loop-options.ts";
import { runAgentOrchestrator } from "./runtime/phases/orchestrator.ts";
import type { AgentLoopRunResult } from "./runtime/loop-result.ts";

const LOOP_BUDGET_MS = readLoopBudgetMsFromRuntime();

export type { AgentLoopRunResult } from "./runtime/loop-result.ts";

export class AgentLoop {
  private reg: ToolRegistry;
  private state: AgentState;
  private llm: LLMProvider;
  private sb: any;
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
  private runStartTime: number;
  private planMode: boolean;
  private chatMode: boolean;
  private approvedPlanBuild: boolean;
  private skipConversationalGate: boolean;
  private approvedPlanSteps: PlanStep[];
  private approvedPlanDesign?: DesignPlanField;
  private narration: NarrationPhase;
  readonly mutable = createAgentLoopMutableState();
  private readonly planStreamState: PlanModeStreamState = {
    llmResponseWasStreamed: false,
    thinkingStreamStartedAt: null,
  };
  /** Heartbeat timer (30s) que mantém `agent_runs.heartbeat_at` fresco durante silêncios longos.
   *  Garante que F5 e snapshot-restore continuem funcionando em runs de design+build > 5min.
   *  H8 fix: reduzido de 90s → 30s. observe() pode demorar 2-5min (npm install + build + tsc).
   *  Sem heartbeat frequente, o cliente (BUSY_ZOMBIE_GAP_MS=3min) marca a run como zumbi
   *  enquanto o agente ainda está vivo trabalhando. 30s é seguro porque o cliente tolera
   *  até 5min de inatividade (H8 alinha com o threshold do cliente). */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Inicia um timer que chama `touchHeartbeat()` a cada 30s enquanto o loop roda. */
  startHeartbeatTimer(intervalMs = 30_000): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      void this.bindings.touchHeartbeat();
    }, intervalMs);
  }

  stopHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private thinkingStreamStartedAt: number | null;
  private touchedPaths: Set<string>;
  private designReadPathsDone = new Set<string>();
  private buildFixResume: boolean;
  private smokeRun: boolean;
  /** FSM state tracking (FORGE 2.0) — validado a cada transição de fase */
  private fsmState: AgentStateData;
  private emitter: RuntimeEmitter;
  /** Cache de conteúdo de arquivos para evitar N+1 queries ao Supabase durante execução */
  private fileContentCache: Map<string, string>;
  private preferences: AgentPreferencesPayload | null;
  private connectorKeys: Record<string, string>;
  /** Últimas skills emitidas — evita repetir o mesmo evento skills em runs subsequentes. */
  private lastEmittedSkills: string[] | null = null;
  private bindings!: LoopBindings;

  get narrationBuffer(): string {
    return this.narration.buffer;
  }

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
    options?: AgentLoopOptions,
  ) {
    this.reg = reg;
    this.llm = llm;
    this.connectorKeys = injectedKeys ?? {};
    this.preferences = options?.preferences ?? null;
    this.sb = supabase;
    this.state = state;
    this.robinActive = robinActive;
    this.projectTemplate = projectTemplate;
    this.stackAddon = stackAddon;
    this.maxStepsLimit = resolveMaxStepsLimit(options);
    this.tasteStart = options?.tasteStart ?? false;
    this.sessionAddon = options?.sessionAddon ?? "";
    this.userSkillNames = options?.userSkillNames ?? [];
    this.resumeRun = options?.resumeRun ?? false;
    this.hasCheckpoint = options?.hasCheckpoint ?? false;
    this.resumePhase = options?.resumePhase ?? null;
    this.complexityScore = options?.complexityScore ?? 3;
    this.runId = options?.runId ?? null;
    this.planMode = options?.planMode ?? false;
    this.chatMode = options?.chatMode ?? false;
    this.approvedPlanBuild = options?.approvedPlanBuild ?? false;
    this.skipConversationalGate = resolveSkipConversationalGate(options);
    this.approvedPlanSteps = options?.planSteps ?? [];
    this.approvedPlanDesign = options?.approvedPlanDesign;
    this.originalUserRequest = resolveLoopOriginalUserRequest(state.messages, options);

    this.thinkingStreamStartedAt = null;
    this.touchedPaths = new Set();
    this.buildFixResume = options?.buildFixResume ?? false;
    this.smokeRun = options?.smokeRun ?? false;
    if (options?.hasCheckpoint) {
      this.mutable.lastCheckpointStep = state.currentStepIndex ?? 0;
    }
    this.fsmState = { name: "idle", since: Date.now() };
    this.emitter = new RuntimeEmitter(onStream, {
      getTaskPhase: () => String(this.state.phase),
    });
    this.narration = new NarrationPhase(
      {
        approvedPlanBuild: options?.approvedPlanBuild ?? false,
        buildFixResume: options?.buildFixResume ?? false,
      },
      (type, data) => this.emitter.emit(type, data),
      () => {
        this.mutable.lastActivityAt = Date.now();
      },
    );
    this.fileContentCache = new Map();
    this.runStartTime = Date.now();
    this.router = new ModelRouter(injectedKeys, routerOverrides, options?.resolvedMainCfg);
    this.observer = new RuntimeObserver(reg, this.fileContentCache, (type, data) => this.emit(type, data));
    this.observer.setApprovedDesign(this.approvedPlanDesign);
    this.observer.setDesignHistory(options?.designHistory ?? []);
    this.skills = new SkillRegistry();
    this.compression = new CompressionManager(this.configuredModel(), (type, data) =>
      this.emitter.emit(type, data),
    );
    this.bindings = createLoopBindings(this.loopHost(), LOOP_BUDGET_MS);
  }

  private loopHost(): AgentLoopHost {
    return {
      sb: this.sb,
      runId: this.runId,
      state: this.state,
      reg: this.reg,
      compression: this.compression,
      observer: this.observer,
      router: this.router,
      robinActive: this.robinActive,
      projectTemplate: this.projectTemplate,
      stackAddon: this.stackAddon,
      sessionAddon: this.sessionAddon,
      tasteStart: this.tasteStart,
      maxStepsLimit: this.maxStepsLimit,
      complexityScore: this.complexityScore,
      originalUserRequest: this.originalUserRequest,
      approvedPlanBuild: this.approvedPlanBuild,
      approvedPlanSteps: this.approvedPlanSteps,
      approvedPlanDesign: this.approvedPlanDesign,
      buildFixResume: this.buildFixResume,
      planStreamState: this.planStreamState,
      fileContentCache: this.fileContentCache,
      touchedPaths: this.touchedPaths,
      narrationBuffer: this.narrationBuffer,
      runStartTime: this.runStartTime,
      mutable: this.mutable,
      narrationTrim: () => this.narrationTrim(),
      tailSlice: (count) => this.tailSlice(count),
      getTimeline: () => this.getTimeline(),
      emitAgentProse: (raw, loopStep) => this.emitAgentProse(raw, loopStep),
      ensureOpeningBeforeWork: (fallback) => this.ensureOpeningBeforeWork(fallback),
      emit: (type, data) => this.emit(type, data),
      configuredModel: () => this.configuredModel(),
      gatherContext: () => this.gatherContext(),
      runDesignPreflightIfNeeded: () => this.runDesignPreflightIfNeeded(),
      requiresFinalBuildGate: () => this.requiresFinalBuildGate(),
      enabledApprovedPlanSteps: () => this.enabledApprovedPlanSteps(),
      isCanceled: () => this.isCanceled(),
      notifyLoopStatus: (ctx) => this.notifyLoopStatus(ctx),
      recordTouchedPath: (path) => this.recordTouchedPath(path),
      attemptGracefulClosing: (reason) => this.attemptGracefulClosing(reason),
      emitTransition: (eventType, data) => this.emitTransition(eventType, data),
      llmChat: (model, instruction, history, forceTools) =>
        this.llmChat(model, instruction, history, forceTools),
      compressMessages: (messages) => this.compressMessages(messages),
      executeTool: (call) => this.executeTool(call),
      markToolsInvoked: () => this.markToolsInvoked(),
      onActivity: () => this.onActivity(),
      getPlanLlmResponseWasStreamed: () => this.getPlanLlmResponseWasStreamed(),
      setPlanLlmResponseWasStreamed: (value) => this.setPlanLlmResponseWasStreamed(value),
    };
  }

  private llmChatHost(): LlmChatHost {
    return {
      state: this.state,
      skills: this.skills,
      projectTemplate: this.projectTemplate,
      stackAddon: this.stackAddon,
      sessionAddon: this.sessionAddon,
      tasteStart: this.tasteStart,
      reg: this.reg,
      complexityScore: this.complexityScore,
      mutable: this.mutable,
      getThinkingStreamStartedAt: () => this.getThinkingStreamStartedAt(),
      setThinkingStreamStartedAt: (value) => this.setThinkingStreamStartedAt(value),
      emit: (type, data) => this.emit(type, data),
      onActivity: () => this.onActivity(),
      runId: this.runId,
      robinActive: this.robinActive,
    };
  }

  /** Modelo BYOK configurado pelo usuário — única voz do chat e da execução. */
  private configuredModel(): LLMProvider {
    return this.llm;
  }

  private loopBudgetExceeded(): boolean {
    return loopBudgetExceededInfra({
      runStartTime: this.runStartTime,
      loopBudgetMs: LOOP_BUDGET_MS,
    });
  }

  private requiresFinalBuildGate(): boolean {
    if (this.planMode || this.chatMode || this.tasteStart) return false;
    return this.touchedPaths.size > 0;
  }

  private async runDesignPreflightIfNeeded(): Promise<void> {
    await runDesignPreflightIfNeededPhase({
      planMode: this.planMode,
      smokeRun: this.smokeRun,
      projectTemplate: this.projectTemplate,
      resumeRun: this.resumeRun,
      touchedPaths: this.touchedPaths,
      state: this.state,
      reg: this.reg,
      loopBudgetExceeded: () => this.loopBudgetExceeded(),
      gatherContext: () => this.gatherContext(),
      touchHeartbeat: () => this.bindings.touchHeartbeat(),
      emit: (type, data) => this.emit(type, data),
    });
  }

  private narrationTrim(): string {
    return this.narration.trim();
  }

  private tailSlice(count: number): unknown[] {
    return this.emitter.tailSlice(count);
  }

  private getTimeline(): Array<{ type: string; data: Record<string, unknown>; timestamp?: number }> {
    return this.emitter.getTailBuffer().slice();
  }

  private emitAgentProse(raw: string, loopStep: number): void {
    this.narration.emitAgentProse(raw, loopStep);
  }

  ensureOpeningBeforeWork(fallback: string): void {
    this.narration.ensureOpeningBeforeWork(fallback);
  }

  private recordTouchedPath(path: string): void {
    if (path) this.touchedPaths.add(path);
  }

  private compressMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
    return this.compression.compress(messages);
  }

  private executeTool(call: Parameters<ToolRegistry["execute"]>[0]) {
    return this.reg.execute(call);
  }

  private markToolsInvoked(): void {
    this.mutable.toolsInvoked = true;
  }

  private onActivity(): void {
    this.mutable.lastActivityAt = Date.now();
  }

  private getThinkingStreamStartedAt(): number | null {
    return this.thinkingStreamStartedAt;
  }

  private setThinkingStreamStartedAt(value: number | null): void {
    this.thinkingStreamStartedAt = value;
  }

  private getPlanLlmResponseWasStreamed(): boolean {
    return this.planStreamState.llmResponseWasStreamed;
  }

  private setPlanLlmResponseWasStreamed(value: boolean): void {
    this.planStreamState.llmResponseWasStreamed = value;
    this.mutable.llmResponseWasStreamed = value;
  }

  private async emitTransition(eventType: string, data?: unknown): Promise<void> {
    this.fsmState = await emitLoopFsmTransition(
      this.fsmState,
      eventType,
      (type, payload) => this.emit(type, payload),
      data,
    );
  }

  async run(): Promise<AgentLoopRunResult> {
    if (!this.resumeRun) {
      this.state.executionLog = [];
    }
    this.compression.reset();
    this.mutable.consecutiveNoContentReadSteps = 0;
    const toolsUsed = new Set<string>();

    return runAgentOrchestrator(buildOrchestratorDeps(this.orchestratorHost(), toolsUsed));
  }

<<<<<<< Updated upstream
  private orchestratorHost() {
=======
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
          message: "Continuando execução…",
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

    await this.runDesignPreflightIfNeeded();

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
            : "Executando plano aprovado…";
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
            message: "Executando…",
          });
        }

        const compressed = await this.compression.compress(this.state.messages);
        const executeInstruction = buildExecuteInstruction(this.originalUserRequest, {
          loopStep,
          buildFixResume: this.buildFixResume,
        });
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
            (actionableIntent && !this.toolsInvoked);
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

    try {
      await this.persistFinal(closingText || "Pronto.", {
        lastFinishOk: true,
      });
    } catch (e) {
      console.error("[loop] persistFinal failed", e);
    }
    try {
      await this.clearCheckpoint();
    } catch (e) {
      console.error("[loop] clearCheckpoint failed", e);
    }
    const tokens = this.compression.getTotalTokens();
    const costUsd = this.compression.getEstimatedCostUsd(this.router.mainCfg.model);
    this.emit("done", {
      summary: (closingText || "Pronto.").slice(0, 2000),
      totalInputTokens: tokens.input,
      totalOutputTokens: tokens.output,
      totalTokens: tokens.total,
      costUsd,
    });
>>>>>>> Stashed changes
    return {
      state: this.state,
      originalUserRequest: this.originalUserRequest,
      planMode: this.planMode,
      chatMode: this.chatMode,
      resumeRun: this.resumeRun,
      hasCheckpoint: this.hasCheckpoint,
      resumePhase: this.resumePhase,
      approvedPlanBuild: this.approvedPlanBuild,
      skipConversationalGate: this.skipConversationalGate,
      complexityScore: this.complexityScore,
      setComplexityScore: (score: number) => {
        this.complexityScore = score;
      },
      maxStepsLimit: this.maxStepsLimit,
      setMaxStepsLimit: (limit: number) => {
        this.maxStepsLimit = limit;
      },
      buildFixResume: this.buildFixResume,
      designReadPathsDone: this.designReadPathsDone,
      fsmState: this.fsmState,
      preferences: this.preferences,
      connectorKeys: this.connectorKeys,
      llm: this.llm,
      router: this.router,
      bindings: this.bindings,
      emit: (type: string, data: unknown) => this.emit(type, data),
      emitTransition: (eventType: string, data?: unknown) => this.emitTransition(eventType, data),
      notifyLoopStatus: (ctx: LoopUpdateContext) => this.notifyLoopStatus(ctx),
      configuredModel: () => this.configuredModel(),
      loopBudgetExceeded: () => this.loopBudgetExceeded(),
      gatherContext: () => this.gatherContext(),
      runChatModeAgentTurn: (model: LLMProvider) => this.runChatModeAgentTurn(model),
      runPlanModeAgentTurn: (model: LLMProvider) => this.runPlanModeAgentTurn(model),
      finishPlanProposal: (plan: ProposedPlan) => this.finishPlanProposal(plan),
    };
  }

  private async gatherContext(): Promise<void> {
    await runGatherContextForHost({
      sb: this.sb,
      state: this.state,
      skills: this.skills,
      userSkillNames: this.userSkillNames,
      lastEmittedSkills: this.lastEmittedSkills,
      fileContentCache: this.fileContentCache,
      touchHeartbeat: () => this.bindings.touchHeartbeat(),
      emit: (type, data) => this.emit(type, data),
      onSkillsEmitted: (invoked) => {
        this.lastEmittedSkills = invoked;
      },
    });
  }

  private async finishPlanProposal(
    proposedPlan: ProposedPlan,
    toolsUsed: string[] = [],
  ): Promise<AgentLoopRunResult> {
    return finishPlanProposalForHost(this.planTurnHost(), proposedPlan, toolsUsed);
  }

  private async runChatModeAgentTurn(model: LLMProvider): Promise<AgentLoopRunResult> {
    return runChatModeAgentTurnForHost(this.chatTurnHost(), model);
  }

  private async runPlanModeAgentTurn(model: LLMProvider): Promise<AgentLoopRunResult> {
    return runPlanModeAgentTurnForHost(this.planTurnHost(), model);
  }

  private chatTurnHost() {
    return {
      state: this.state,
      mutable: this.mutable,
      planStreamState: this.planStreamState,
      thinkingStreamStartedAt: this.thinkingStreamStartedAt,
      setThinkingStreamStartedAt: (value: number | null) => {
        this.thinkingStreamStartedAt = value;
      },
      bindings: this.bindings,
      originalUserRequest: this.originalUserRequest,
      robinActive: this.robinActive,
      onActivity: () => this.onActivity(),
    };
  }

  private planTurnHost() {
    return {
      state: this.state,
      skills: this.skills,
      mutable: this.mutable,
      planStreamState: this.planStreamState,
      thinkingStreamStartedAt: this.thinkingStreamStartedAt,
      setThinkingStreamStartedAt: (value: number | null) => {
        this.thinkingStreamStartedAt = value;
      },
      bindings: this.bindings,
    };
  }

  /**
   * Antes de um fail duro, tenta uma chamada amigável ao mesmo LLM pedindo
   * um fechamento com contexto. O LLM já tem todo o histórico — só empurramos
   * um nudge e chamamos com tool_choice restrito.
   *
   * Retorna o texto de fechamento, ou null se o LLM não respondeu.
   *
   * - tool_miss / build_fail: tool_choice = "none" — só texto.
   * - plan_stuck: tools = [create_plan] — o LLM pode tentar gerar o plano
   *   com base no que já explorou. Se gerar, chama finishPlanProposal.
   */
  private async attemptGracefulClosing(
    reason: "tool_miss" | "build_fail" | "plan_stuck",
  ): Promise<string | null> {
    return attemptGracefulClosingForHost(
      {
        state: this.state,
        configuredModel: () => this.configuredModel(),
        finishPlanProposal: async (proposed) => {
          await finishPlanProposalForHost(this.planTurnHost(), proposed);
        },
      },
      reason,
    );
  }

  private async llmChat(
    model: LLMProvider,
    instruction: string,
    history: ChatMessage[],
    forceTools = false,
    _tools?: ToolDefinition[],
  ): Promise<ChatResponse | null> {
    return runLlmChatForHost(this.llmChatHost(), model, instruction, history, forceTools);
  }

  private async isCanceled(): Promise<boolean> {
    return isRunCanceled(this.sb, this.runId);
  }

  private enabledApprovedPlanSteps(): PlanStep[] {
    const enabled = this.approvedPlanSteps.filter((s) => s.enabled !== false);
    return enabled.length > 0 ? enabled : this.approvedPlanSteps;
  }

  private notifyLoopStatus(ctx: LoopUpdateContext): void {
    notifyLoopStatusFromHost(
      this.narration,
      ctx,
      this.originalUserRequest,
      this.touchedPaths,
    );
  }

  private emit(type: string, data: unknown): void {
    this.emitter.emit(type, data);
  }
}
