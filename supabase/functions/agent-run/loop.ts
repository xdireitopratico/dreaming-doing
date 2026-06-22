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
import { sanitizeUserFacingProse } from "./sanitize-prose.ts";
import { extractOriginalUserRequest } from "./run-context.ts";
import {
  formatClarifyMessage,
  hasMixedMetaAndExecution,
  splitMetaToolCalls,
} from "./tools/meta.ts";
import { MAX_CHUNK_GENERATIONS } from "../_shared/agent-chunk-limits.ts";

import { logger } from "../_shared/logger.ts";

import { buildExecutionLogMeta } from "./executionLogMeta.ts";

import { checkpointChatText } from "./checkpoint-chat.ts";
import {
  auditDesignInventory,
  needsDesignPreflight,
  runDesignPreflight,
} from "./design-preflight.ts";
import { type CheckpointExtra, serializeCheckpointPayload } from "./checkpoint.ts";
import type { ProviderConfig } from "./providers.ts";
import type { AgentPreferencesPayload } from "./connector-keys.ts";
import { resolveAutoForComplexity } from "../_shared/model-presets.ts";
import { ResilientLLM } from "./robin-pool.ts";
import { formatLoopStatus, type LoopUpdateContext } from "./loop-status.ts";
import { type AgentStateData, applyTransition, isTerminal } from "./agent-fsm.ts";
import { RuntimeEmitter, type StreamCallback } from "./runtime/emitter.ts";
import { capMetaSize, readLoopBudgetMsFromRuntime } from "./runtime/loop-config.ts";
import {
  buildBuildAgentSystemPrompt,
  buildBuildContextBlock,
  chatBuildModeLlm,
} from "./runtime/llm-chat.ts";
import { buildCardSnapshot as buildCardSnapshotFromTimeline } from "./runtime/phases/snapshot.ts";
import { runGatherContextPhase } from "./runtime/phases/gather-context.ts";
import { NarrationPhase } from "./runtime/phases/narration.ts";
import {
  attemptPlanStuckClosing,
  finishClarify as finishPlanClarify,
  finishPlanModeFailure as finishPlanTurnFailure,
  finishPlanProposal as finishPlanTurnProposal,
  runPlanModeAgentTurn as runPlanModeAgentTurnPhase,
  type PlanModeStreamState,
  type PlanTurnFinishDeps,
} from "./runtime/phases/plan-turn.ts";
import { runBuildExecutePhase } from "./runtime/phases/execute.ts";
import { runAgentOrchestrator } from "./runtime/phases/orchestrator.ts";

const CHECKPOINT_INTERVAL_STEPS = 2;
const MAX_LLM_RETRIES = 3;

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
      void this.touchHeartbeat();
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
    return Date.now() - this.runStartTime > LOOP_BUDGET_MS;
  }

  private requiresFinalBuildGate(): boolean {
    if (this.planMode || this.tasteStart) return false;
    return this.touchedPaths.size > 0;
  }

  /** Inventário + npm install/build no sandbox antes do 1º fs_* em templates web. */
  private async runDesignPreflightIfNeeded(): Promise<void> {
    if (this.planMode || !needsDesignPreflight(this.projectTemplate)) return;
    if (this.resumeRun && this.touchedPaths.size > 0) return;
    if (this.loopBudgetExceeded()) return;

    if (!this.state.context?.files?.length) {
      await this.gatherContext();
    }

    const files = this.state.context?.files ?? [];
    const inventory = auditDesignInventory(files);
    const preflightErrors: string[] = [];
    if (!inventory.ok) preflightErrors.push(`Faltam: ${inventory.missing.join(", ")}`);
    if (inventory.warnings.length > 0) preflightErrors.push(`Imports: ${inventory.warnings.slice(0, 3).join(", ")}`);

    await this.touchHeartbeat();
    this.emit("phase", { phase: "preflight", message: "Executando..." });

    const preflight = await runDesignPreflight(this.reg);
    const manifest = preflight.availableComponents;
    if (this.state.context) {
      this.state.context.projectConfig += `\n\n## Design System (@forge/ui)\n${manifest}`;
    }

    if (!preflight.passed) {
      const failed = preflight.checks.filter((c) => !c.ok).map((c) => c.name).join(", ");
      this.emit("validate_fail", {
        attempt: 0,
        checks: failed ? [failed] : ["preflight"],
        feedback: preflight.feedback?.slice(0, 500),
        preflight: true,
      });
      preflightErrors.push(`Design system: ${preflight.feedback?.slice(0, 500) ?? "erro"}`);
    }

    if (preflightErrors.length > 0) {
      this.state.messages.push({ role: "user", content: `PREFLIGHT FALHOU:\n${preflightErrors.join("\n")}\nCorrija antes de continuar.` });
      return;
    }
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
    this.emit("explore", {
      message: this.narration.buffer || "",
    });
    await this.persistCheckpointChat(steps, options?.buildFix);
    return {
      ok: false,
      error: "Retomando automaticamente em novo chunk…",
      steps,
      resumable: true,
      buildFix: options?.buildFix === true,
      toolsUsed: [...toolsUsed],
    };
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
    const narration = this.narration.trim();
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
        message: "Janela de execução concluída — progresso salvo para continuar",
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
    if (reason === "plan_stuck") {
      return attemptPlanStuckClosing({
        messages: this.state.messages,
        model: this.configuredModel(),
        finishProposal: async (proposed) => {
          await finishPlanTurnProposal(this.buildPlanTurnFinishDeps(), proposed);
        },
      });
    }

    const nudge: Record<"tool_miss" | "build_fail", string> = {
      tool_miss:
        "O sistema detectou que você não está progredindo. " +
        "Sem usar ferramentas, escreva uma mensagem amigável para o usuário " +
        "explicando o que estava tentando fazer, o que deu errado, e perguntando " +
        "se pode continuar na próxima sessão.",
      build_fail:
        "O build falhou após várias tentativas. " +
        "Sem usar ferramentas, escreva uma mensagem para o usuário " +
        "explicando qual foi o erro, o que foi tentado, e perguntando " +
        "se pode continuar corrigindo na próxima sessão.",
    };

    this.state.messages.push({ role: "user", content: nudge[reason] });

    try {
      const response = await this.configuredModel().chat({
        messages: this.state.messages,
        tool_choice: "none",
        tools: [],
        max_tokens: 1024,
        temperature: 0.7,
      });

      const text = (response.content ?? "").trim();
      if (!text) return null;
      return sanitizeUserFacingProse(text);
    } catch {
      return null;
    }
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
    // H10 fix: sempre atualizar status de TODOS os tool calls (ok/error/running).
    // Antes, se um tool falhava, ficava "running" pra sempre. Agora,
    // - se result.ok: "ok"
    // - se !result.ok: "error" + error message + output resumido
    // - se não está em execResults (não executou): "running" (legítimo)
    const execMap = new Map(execResults.map((r) => [r.call.id, r.result]));
    const tool_calls = (response.tool_calls ?? []).map((tc) => {
      const result = execMap.get(tc.id);
      const hasResult = result !== undefined;
      return {
        id: tc.id,
        name: tc.name,
        args: tc.arguments,
        status: hasResult ? (result.ok ? "ok" : "error") : "running",
        error: hasResult ? (result.error ?? null) : null,
        artifacts: hasResult ? (result.artifacts ?? []) : [],
      };
    });
    const meta = buildExecutionLogMeta(null, this.state.executionLog, step);
    await this.sb.from("messages").update({ tool_calls, meta }).eq("id", msgId);
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
    return buildCardSnapshotFromTimeline({
      timeline: this.emitter.getTailBuffer().slice(),
      narrationBuffer: this.narration.buffer,
      runStartTime: this.runStartTime,
      runId: this.runId,
      projectId: this.state.projectId,
      currentStepIndex: this.state.currentStepIndex,
      maxStepsLimit: this.maxStepsLimit,
      opts,
    });
  }

  private async persistCheckpointChat(steps: number, buildFix?: boolean): Promise<void> {
    const buildFixFlag = buildFix === true;
    const text = checkpointChatText(this.narration.buffer, buildFixFlag);
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
      streamTail: this.emitter.tailSlice(120),
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
      const updateData: Record<string, unknown> = {
        tool_calls: [],
        meta,
      };
      if (text) {
        updateData.parts = [{ type: "text", text }];
      }
      await this.sb.from("messages").update(updateData).eq("id", existingId);
      await this.sb
        .from("projects")
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq("id", this.state.projectId);
      return;
    }

    if (!text) return;

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
      streamTail: this.emitter.tailSlice(120),
      cardSnapshot,
      latencyThoughtMs:
        typeof cardSnapshot.latencyThoughtMs === "number"
          ? cardSnapshot.latencyThoughtMs
          : undefined,
      narrationText:
        typeof cardSnapshot.narrationText === "string" ? cardSnapshot.narrationText : undefined,
    };
    const cappedMeta = capMetaSize(meta); // H9

    const existingId = await this.resolveExistingRunMessageId();
    if (existingId) {
      await this.sb
        .from("messages")
        .update({
          parts: [{ type: "text", text }],
          tool_calls: [],
          meta: cappedMeta,
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
      meta: cappedMeta,
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
