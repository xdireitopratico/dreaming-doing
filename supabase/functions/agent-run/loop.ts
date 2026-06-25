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
    this.observer = new RuntimeObserver(reg, this.fileContentCache);
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

  private orchestratorHost() {
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
