// loop.ts — AgentLoop definitivo.
// Compression, Parallel Exec, Runtime Observer, Skills,
// persistência incremental de tool_calls (cada step vira uma message viva no chat).
// FSM integrada para validação de transições de estado (FORGE 2.0).
import type {
  AgentState,
  ChatMessage,
  ChatResponse,
  FileEntry,
  LLMProvider,
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
import { extractOriginalUserRequest } from "./run-context.ts";
import type { ProviderConfig } from "./providers.ts";
import type { AgentPreferencesPayload } from "./connector-keys.ts";
import { resolveAutoForComplexity } from "../_shared/model-presets.ts";
import { ResilientLLM } from "./robin-pool.ts";
import { formatLoopStatus, type LoopUpdateContext } from "./loop-status.ts";
import { type AgentStateData, applyTransition } from "./agent-fsm.ts";
import { RuntimeEmitter, type StreamCallback } from "./runtime/emitter.ts";
import {
  bumpLlmRetries as bumpLlmRetriesInfra,
  loopBudgetExceeded as loopBudgetExceededInfra,
  maybeEmitSilenceHeartbeat as maybeEmitSilenceHeartbeatInfra,
  resetLlmRetries as resetLlmRetriesInfra,
  returnResumableChunk as returnResumableChunkInfra,
  touchHeartbeat as touchHeartbeatInfra,
  type RunInfraDeps,
} from "./runtime/infra.ts";
import { readLoopBudgetMsFromRuntime } from "./runtime/loop-config.ts";
import {
  buildBuildAgentSystemPrompt,
  buildBuildContextBlock,
  chatBuildModeLlm,
} from "./runtime/llm-chat.ts";
import { runDesignPreflightIfNeeded as runDesignPreflightIfNeededPhase } from "./runtime/phases/design-preflight-phase.ts";
import { attemptGracefulClosing as attemptGracefulClosingPhase } from "./runtime/phases/graceful-closing.ts";
import { runGatherContextPhase } from "./runtime/phases/gather-context.ts";
import {
  clearCheckpoint as clearAgentCheckpoint,
  persistAssistantStep as persistAssistantStepPhase,
  persistCheckpointChat as persistCheckpointChatPhase,
  persistFinal as persistFinalPhase,
  persistPlanFinal as persistPlanFinalPhase,
  saveCheckpoint as saveAgentCheckpoint,
  updateAssistantStep as updateAssistantStepPhase,
  type AgentPersistDeps,
} from "./runtime/phases/persist.ts";
import { NarrationPhase } from "./runtime/phases/narration.ts";
import {
  finishClarify as finishPlanClarify,
  finishPlanModeFailure as finishPlanTurnFailure,
  finishPlanProposal as finishPlanTurnProposal,
  runPlanModeAgentTurn as runPlanModeAgentTurnPhase,
  type PlanModeStreamState,
  type PlanTurnFinishDeps,
} from "./runtime/phases/plan-turn.ts";
import { runBuildExecutePhase } from "./runtime/phases/execute.ts";
import { runAgentOrchestrator } from "./runtime/phases/orchestrator.ts";

const LOOP_BUDGET_MS = readLoopBudgetMsFromRuntime();

export type AgentLoopRunResult = {
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
  plan?: ProposedPlan;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
};

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
  private toolsInvoked: boolean;
  private runStartTime: number;
  private lastCheckpointStep: number;
  private planMode: boolean;
  private approvedPlanBuild: boolean;
  private skipConversationalGate: boolean;
  private approvedPlanSteps: PlanStep[];
  private approvedPlanStepIndex: number;
  private narration: NarrationPhase;
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
      void touchHeartbeatInfra(this.buildInfraDeps());
    }, intervalMs);
  }

  stopHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private llmResponseWasStreamed: boolean;
  private toolMissCount: number;
  private forceToolsNext: boolean;
  private thinkingStreamStartedAt: number | null;
  private lastExecutePhaseMessage: string | null;
  private chunkGeneration: number;
  private consecutiveNoContentReadSteps: number;
  private touchedPaths: Set<string>;
  private lastActivityAt: number;
  private lastRunMessageId: string | null;
  private buildFixResume: boolean;
  /** FSM state tracking (FORGE 2.0) — validado a cada transição de fase */
  private fsmState: AgentStateData;
  private emitter: RuntimeEmitter;
  /** Cache de conteúdo de arquivos para evitar N+1 queries ao Supabase durante execução */
  private fileContentCache: Map<string, string>;
  private preferences: AgentPreferencesPayload | null;
  private connectorKeys: Record<string, string>;
  /** Últimas skills emitidas — evita repetir o mesmo evento skills em runs subsequentes. */
  private lastEmittedSkills: string[] | null = null;

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


    this.llmResponseWasStreamed = false;
    this.toolMissCount = 0;
    this.forceToolsNext = false;
    this.thinkingStreamStartedAt = null;
    this.lastExecutePhaseMessage = null;
    this.chunkGeneration = options?.chunkGeneration ?? 0;
    this.consecutiveNoContentReadSteps = 0;
    this.touchedPaths = new Set();
    this.lastActivityAt = Date.now();
    this.lastRunMessageId = null;
    this.buildFixResume = options?.buildFixResume ?? false;
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
        this.lastActivityAt = Date.now();
      },
    );
    this.fileContentCache = new Map();
    this.runStartTime = Date.now();
    this.lastCheckpointStep = options?.hasCheckpoint ? (state.currentStepIndex ?? 0) : 0;
    this.router = new ModelRouter(injectedKeys, routerOverrides, options?.resolvedMainCfg);
    this.observer = new RuntimeObserver(reg, this.fileContentCache);
    this.skills = new SkillRegistry();
    this.compression = new CompressionManager(this.configuredModel(), (type, data) =>
      this.emitter.emit(type, data),
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
    return loopBudgetExceededInfra({
      runStartTime: this.runStartTime,
      loopBudgetMs: LOOP_BUDGET_MS,
    });
  }

  private requiresFinalBuildGate(): boolean {
    if (this.planMode || this.tasteStart) return false;
    return this.touchedPaths.size > 0;
  }

  private async runDesignPreflightIfNeeded(): Promise<void> {
    await runDesignPreflightIfNeededPhase({
      planMode: this.planMode,
      projectTemplate: this.projectTemplate,
      resumeRun: this.resumeRun,
      touchedPaths: this.touchedPaths,
      state: this.state,
      reg: this.reg,
      loopBudgetExceeded: () => this.loopBudgetExceeded(),
      gatherContext: () => this.gatherContext(),
      touchHeartbeat: () => this.touchHeartbeat(),
      emit: (type, data) => this.emit(type, data),
    });
  }

  private async returnResumableChunk(
    steps: number,
    toolsUsed: Set<string>,
    options?: { buildFix?: boolean },
  ) {
    return returnResumableChunkInfra(this.buildInfraDeps(), steps, toolsUsed, options);
  }

  private recordTouchedPath(path: string): void {
    if (path) this.touchedPaths.add(path);
  }

  private async touchHeartbeat(): Promise<void> {
    await touchHeartbeatInfra(this.buildInfraDeps());
  }

  private async bumpLlmRetries(): Promise<number> {
    return bumpLlmRetriesInfra(this.buildInfraDeps());
  }

  private async resetLlmRetries(): Promise<void> {
    await resetLlmRetriesInfra(this.buildInfraDeps());
  }

  private maybeEmitSilenceHeartbeat(): void {
    maybeEmitSilenceHeartbeatInfra(this.buildInfraDeps());
  }

  private buildInfraDeps(): RunInfraDeps {
    return {
      sb: this.sb,
      runId: this.runId,
      runStartTime: this.runStartTime,
      loopBudgetMs: LOOP_BUDGET_MS,
      getLastActivityAt: () => this.lastActivityAt,
      setLastActivityAt: (ms) => {
        this.lastActivityAt = ms;
      },
      getMaxStepsLimit: () => this.maxStepsLimit,
      touchedPaths: this.touchedPaths,
      narrationTrim: () => this.narration.trim(),
      narrationBuffer: this.narration.buffer,
      emit: (type, data) => this.emit(type, data),
      getPhase: () => this.state.phase,
      saveCheckpoint: (phase, force) => this.saveCheckpoint(phase, force),
      persistCheckpointChat: (steps, buildFix) => this.persistCheckpointChat(steps, buildFix),
    };
  }

  private buildPersistDeps(): AgentPersistDeps {
    return {
      sb: this.sb,
      runId: this.runId,
      state: this.state,
      getLastRunMessageId: () => this.lastRunMessageId,
      setLastRunMessageId: (id) => {
        this.lastRunMessageId = id;
      },
      getMaxStepsLimit: () => this.maxStepsLimit,
      getComplexityScore: () => this.complexityScore,
      touchedPaths: this.touchedPaths,
      narrationBuffer: this.narration.buffer,
      tailSlice: (count) => this.emitter.tailSlice(count),
      getTimeline: () => this.emitter.getTailBuffer().slice(),
      runStartTime: this.runStartTime,
      getLastCheckpointStep: () => this.lastCheckpointStep,
      setLastCheckpointStep: (step) => {
        this.lastCheckpointStep = step;
      },
      emit: (type, data) => this.emit(type, data),
      loopBudgetMs: LOOP_BUDGET_MS,
    };
  }

  private async clearCheckpoint(): Promise<void> {
    await clearAgentCheckpoint(this.buildPersistDeps());
  }

  private async saveCheckpoint(phase: LoopPhase, force = false): Promise<void> {
    await saveAgentCheckpoint(this.buildPersistDeps(), phase, force);
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

  async run(): Promise<AgentLoopRunResult> {
    if (!this.resumeRun) {
      this.state.executionLog = [];
    }
    this.compression.reset();
    this.consecutiveNoContentReadSteps = 0;
    const toolsUsed = new Set<string>();

    return runAgentOrchestrator({
      state: this.state,
      context: this.state.context,
      originalUserRequest: this.originalUserRequest,
      planMode: this.planMode,
      emit: (type, data) => this.emit(type, data),
      configuredModel: () => this.configuredModel(),
      persistFinal: (summary, opts) => this.persistFinal(summary, opts),
      clearCheckpoint: () => this.clearCheckpoint(),
      resumeRun: this.resumeRun,
      hasCheckpoint: this.hasCheckpoint,
      resumePhase: this.resumePhase,
      approvedPlanBuild: this.approvedPlanBuild,
      skipConversationalGate: this.skipConversationalGate,
      complexityScore: this.complexityScore,
      setComplexityScore: (score) => {
        this.complexityScore = score;
      },
      maxStepsLimit: this.maxStepsLimit,
      setMaxStepsLimit: (limit) => {
        this.maxStepsLimit = limit;
      },
      toolsUsed,
      fsmStateName: this.fsmState.name,
      emitTransition: (eventType, data) => this.emitTransition(eventType, data),
      notifyLoopStatus: (ctx) => this.notifyLoopStatus(ctx),
      applyAutoModelForComplexity: (complexity) => this.applyAutoModelForComplexity(complexity),
      loopBudgetExceeded: () => this.loopBudgetExceeded(),
      returnResumableChunk: (steps, used) => this.returnResumableChunk(steps, used),
      gatherContext: () => this.gatherContext(),
      saveCheckpoint: (phase) => this.saveCheckpoint(phase),
      runPlanModeAgentTurn: (model) => this.runPlanModeAgentTurn(model),
      finishPlanProposal: (plan) => this.finishPlanProposal(plan),
      runBuildExecute: (used, model, step) =>
        runBuildExecutePhase(this.buildExecuteDeps(used, model), step),
      buildFixResume: this.buildFixResume,
    });
  }

  private buildExecuteDeps(
    toolsUsed: Set<string>,
    executionModel: LLMProvider,
  ) {
    return {
      approvedPlanBuild: this.approvedPlanBuild,
      approvedPlanSteps: this.approvedPlanSteps,
      getApprovedPlanStepIndex: () => this.approvedPlanStepIndex,
      setApprovedPlanStepIndex: (index: number) => {
        this.approvedPlanStepIndex = index;
      },
      buildFixResume: this.buildFixResume,
      originalUserRequest: this.originalUserRequest,
      projectTemplate: this.projectTemplate,
      maxStepsLimit: this.maxStepsLimit,
      state: this.state,
      toolsUsed,
      fileContentCache: this.fileContentCache,
      getToolMissCount: () => this.toolMissCount,
      setToolMissCount: (count: number) => {
        this.toolMissCount = count;
      },
      getForceToolsNext: () => this.forceToolsNext,
      setForceToolsNext: (value: boolean) => {
        this.forceToolsNext = value;
      },
      getToolsInvoked: () => this.toolsInvoked,
      setToolsInvoked: (value: boolean) => {
        this.toolsInvoked = value;
      },
      getConsecutiveNoContentReadSteps: () => this.consecutiveNoContentReadSteps,
      setConsecutiveNoContentReadSteps: (value: number) => {
        this.consecutiveNoContentReadSteps = value;
      },
      getLlmResponseWasStreamed: () => this.llmResponseWasStreamed,
      getLastExecutePhaseMessage: () => this.lastExecutePhaseMessage,
      setLastExecutePhaseMessage: (value: string | null) => {
        this.lastExecutePhaseMessage = value;
      },
      touchedPaths: this.touchedPaths,
      executionModel,
      reg: this.reg,
      compression: this.compression,
      observer: this.observer,
      router: this.router,
      emitAgentProse: (raw: string, loopStep: number) => {
        this.narration.emitAgentProse(raw, loopStep);
      },
      narrationBuffer: this.narration.buffer,
      emit: (type: string, data: unknown) => this.emit(type, data),
      loopBudgetExceeded: () => this.loopBudgetExceeded(),
      returnResumableChunk: (steps, used, options) =>
        this.returnResumableChunk(steps, used, options),
      runDesignPreflightIfNeeded: () => this.runDesignPreflightIfNeeded(),
      requiresFinalBuildGate: () => this.requiresFinalBuildGate(),
      enabledApprovedPlanSteps: () => this.enabledApprovedPlanSteps(),
      isCanceled: () => this.isCanceled(),
      touchHeartbeat: () => this.touchHeartbeat(),
      maybeEmitSilenceHeartbeat: () => this.maybeEmitSilenceHeartbeat(),
      bumpLlmRetries: () => this.bumpLlmRetries(),
      resetLlmRetries: () => this.resetLlmRetries(),
      saveCheckpoint: (phase, force) => this.saveCheckpoint(phase, force),
      persistFinal: (summary, opts) => this.persistFinal(summary, opts),
      clearCheckpoint: () => this.clearCheckpoint(),
      persistAssistantStep: (response) => this.persistAssistantStep(response),
      updateAssistantStep: (msgId, response, execResults, step) =>
        this.updateAssistantStep(msgId, response, execResults, step),
      notifyLoopStatus: (ctx) => this.notifyLoopStatus(ctx),
      recordTouchedPath: (path) => this.recordTouchedPath(path),
      finishClarify: (message, steps, used) => this.finishClarify(message, steps, used),
      attemptGracefulClosing: (reason) => this.attemptGracefulClosing(reason),
      emitTransition: (eventType, data) => this.emitTransition(eventType, data),
      llmChat: (model, instruction, history, forceTools) =>
        this.llmChat(model, instruction, history, forceTools),
      getContextFiles: () => this.state.context?.files ?? [],
    };
  }


  private async gatherContext(): Promise<void> {
    this.state.context = await runGatherContextPhase({
      touchHeartbeat: () => this.touchHeartbeat(),
      fetchProjectFiles: async () => {
        const { data: files } = await this.sb
          .from("project_files")
          .select("path, content, updated_at")
          .eq("project_id", this.state.projectId);
        return files ?? [];
      },
      detectStackSkillNames: (fileList) =>
        this.skills.detectActive(fileList as FileEntry[]).map((s) => s.name),
      messages: this.state.messages,
      userSkillNames: this.userSkillNames,
      lastEmittedSkills: this.lastEmittedSkills,
      onFileCached: (path, content) => this.fileContentCache.set(path, content),
      emitSkills: (payload) => {
        this.lastEmittedSkills = payload.invoked;
        this.emit("skills", payload);
      },
    });
  }

  private buildPlanTurnFinishDeps(): PlanTurnFinishDeps {
    return {
      runId: this.runId,
      projectId: this.state.projectId,
      llmResponseWasStreamed: this.llmResponseWasStreamed,
      emit: (type, data) => this.emit(type, data),
      configuredModel: () => this.configuredModel(),
      persistFinal: (summary, opts) => this.persistFinal(summary, opts),
      persistPlanFinal: (summary, plan) => this.persistPlanFinal(summary, plan),
      clearCheckpoint: () => this.clearCheckpoint(),
      emitTransition: (eventType, data) => this.emitTransition(eventType, data),
    };
  }

  private async finishPlanModeFailure(
    summary: string,
    steps: number,
    toolsUsed: readonly string[],
    error?: string,
  ) {
    return finishPlanTurnFailure(
      this.buildPlanTurnFinishDeps(),
      summary,
      steps,
      toolsUsed,
      error,
    );
  }

  private async finishPlanProposal(
    proposedPlan: ProposedPlan,
    toolsUsed: string[] = [],
  ): Promise<AgentLoopRunResult> {
    return finishPlanTurnProposal(
      this.buildPlanTurnFinishDeps(),
      proposedPlan,
      toolsUsed,
    );
  }

  private async finishClarify(
    message: string,
    steps: number,
    toolsUsed: string[],
  ): Promise<AgentLoopRunResult> {
    return finishPlanClarify(this.buildPlanTurnFinishDeps(), message, steps, toolsUsed);
  }

  private async runPlanModeAgentTurn(model: LLMProvider): Promise<AgentLoopRunResult> {
    const skillPrompt = this.state.context
      ? this.skills.buildSkillPrompt(this.state.context.files)
      : "";
    this.planStreamState.llmResponseWasStreamed = this.llmResponseWasStreamed;
    this.planStreamState.thinkingStreamStartedAt = this.thinkingStreamStartedAt;

    const result = await runPlanModeAgentTurnPhase(
      {
        ...this.buildPlanTurnFinishDeps(),
        robinActive: this.robinActive,
        originalUserRequest: this.originalUserRequest,
        state: this.state,
        context: this.state.context,
        intent: this.state.intent,
        complexityScore: this.complexityScore,
        projectTemplate: this.projectTemplate,
        stackAddon: this.stackAddon,
        sessionAddon: this.sessionAddon,
        tasteStart: this.tasteStart,
        skillPrompt,
        toolDefinitions: this.reg.getDefinitions(),
        streamState: this.planStreamState,
        compressMessages: (messages) => this.compression.compress(messages),
        loopBudgetExceeded: () => this.loopBudgetExceeded(),
        returnResumableChunk: (steps, toolsUsed) => this.returnResumableChunk(steps, toolsUsed),
        saveCheckpoint: (phase) => this.saveCheckpoint(phase),
        attemptGracefulClosing: (reason) => this.attemptGracefulClosing(reason),
        executeTool: (call) => this.reg.execute(call),
        markToolsInvoked: () => {
          this.toolsInvoked = true;
        },
        onActivity: () => {
          this.lastActivityAt = Date.now();
        },
        getLlmResponseWasStreamed: () => this.planStreamState.llmResponseWasStreamed,
        setLlmResponseWasStreamed: (value) => {
          this.planStreamState.llmResponseWasStreamed = value;
          this.llmResponseWasStreamed = value;
        },
      },
      model,
    );

    this.llmResponseWasStreamed = this.planStreamState.llmResponseWasStreamed;
    this.thinkingStreamStartedAt = this.planStreamState.thinkingStreamStartedAt;
    return result;
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
    return attemptGracefulClosingPhase(
      {
        messages: this.state.messages,
        configuredModel: () => this.configuredModel(),
        finishPlanProposal: async (proposed) => {
          await finishPlanTurnProposal(this.buildPlanTurnFinishDeps(), proposed);
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
    tools?: ToolDefinition[],
  ): Promise<ChatResponse | null> {
    const skillPrompt = this.state.context
      ? this.skills.buildSkillPrompt(this.state.context.files)
      : "";
    const streamState = {
      llmResponseWasStreamed: this.llmResponseWasStreamed,
      thinkingStreamStartedAt: this.thinkingStreamStartedAt,
    };

    const response = await chatBuildModeLlm({
      model,
      instruction,
      history,
      contextBlock: buildBuildContextBlock(this.state.context),
      fullSystemPrompt: buildBuildAgentSystemPrompt({
        projectTemplate: this.projectTemplate,
        stackAddon: this.stackAddon,
        sessionAddon: this.sessionAddon,
        tasteStart: this.tasteStart,
        skillPrompt,
      }),
      toolDefinitions: this.reg.getDefinitions(),
      complexityScore: this.complexityScore,
      forceTools,
      tools,
      streamState,
      emit: (type, data) => this.emit(type, data),
      onActivity: () => {
        this.lastActivityAt = Date.now();
      },
      onThinkingCapExceeded: () => {
        this.forceToolsNext = true;
      },
      runId: this.runId,
      robinActive: this.robinActive,
    });

    this.llmResponseWasStreamed = streamState.llmResponseWasStreamed;
    this.thinkingStreamStartedAt = streamState.thinkingStreamStartedAt;
    return response;
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
    return persistAssistantStepPhase(this.buildPersistDeps(), response);
  }

  private async updateAssistantStep(
    msgId: string,
    response: ChatResponse,
    execResults: Array<{ call: any; result: any }>,
    step: number,
  ): Promise<void> {
    await updateAssistantStepPhase(this.buildPersistDeps(), msgId, response, execResults, step);
  }

  private async persistCheckpointChat(steps: number, buildFix?: boolean): Promise<void> {
    await persistCheckpointChatPhase(this.buildPersistDeps(), steps, buildFix);
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
    await persistFinalPhase(this.buildPersistDeps(), summary, opts);
  }

  private async persistPlanFinal(summary: string, plan: ProposedPlan): Promise<void> {
    await persistPlanFinalPhase(this.buildPersistDeps(), summary, plan);
  }

  private enabledApprovedPlanSteps(): PlanStep[] {
    const enabled = this.approvedPlanSteps.filter((s) => s.enabled !== false);
    return enabled.length > 0 ? enabled : this.approvedPlanSteps;
  }

  private notifyLoopStatus(ctx: LoopUpdateContext): void {
    const text = formatLoopStatus({
      ...ctx,
      userRequest: this.originalUserRequest ?? undefined,
      touchedPaths: [...this.touchedPaths],
    });
    if (!text) return;
    this.notifyExecution(text);
  }

  /** Progresso factual do loop — sempre inspector (FASE 2..N). */
  private notifyExecution(text: string): void {
    this.narration.emitInspectorNote(text);
  }

  private emit(type: string, data: unknown): void {
    this.emitter.emit(type, data);
  }
}
