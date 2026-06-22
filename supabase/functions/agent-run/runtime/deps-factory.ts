// runtime/deps-factory.ts — Factories de deps para fases do loop (Fase 2.2)
import type { CompressionManager } from "../compression.ts";
import type { RuntimeObserver } from "../observer.ts";
import type { ModelRouter } from "../router.ts";
import type { LoopUpdateContext } from "../loop-status.ts";
import type {
  AgentState,
  ChatMessage,
  ChatResponse,
  LLMProvider,
  PlanStep,
  ProposedPlan,
  ToolCall,
  ToolRegistry,
  ToolResult,
} from "../types.ts";
import { LoopPhase } from "../types.ts";
import type { RunInfraDeps } from "./infra.ts";
import type { AgentPersistDeps, PersistFinalOpts } from "./phases/persist.ts";
import type { BuildExecuteDeps } from "./phases/execute.ts";
import type { PlanModeStreamState, PlanTurnDeps, PlanTurnFinishDeps } from "./phases/plan-turn.ts";

export type AgentLoopDepsContext = {
  sb: any;
  runId: string | null;
  state: AgentState;
  reg: ToolRegistry;
  compression: CompressionManager;
  observer: RuntimeObserver;
  router: ModelRouter;
  robinActive: boolean;
  projectTemplate: string;
  stackAddon: string;
  sessionAddon: string;
  tasteStart: boolean;
  maxStepsLimit: number;
  complexityScore: number;
  originalUserRequest: string;
  approvedPlanBuild: boolean;
  approvedPlanSteps: PlanStep[];
  buildFixResume: boolean;
  planStreamState: PlanModeStreamState;
  fileContentCache: Map<string, string>;
  touchedPaths: Set<string>;
  narrationBuffer: string;
  runStartTime: number;
  getLastCheckpointStep: () => number;
  setLastCheckpointStep: (step: number) => void;
  getApprovedPlanStepIndex: () => number;
  setApprovedPlanStepIndex: (index: number) => void;
  getToolMissCount: () => number;
  setToolMissCount: (count: number) => void;
  getForceToolsNext: () => boolean;
  setForceToolsNext: (value: boolean) => void;
  getToolsInvoked: () => boolean;
  setToolsInvoked: (value: boolean) => void;
  getConsecutiveNoContentReadSteps: () => number;
  setConsecutiveNoContentReadSteps: (value: number) => void;
  getLlmResponseWasStreamed: () => boolean;
  getLastExecutePhaseMessage: () => string | null;
  setLastExecutePhaseMessage: (value: string | null) => void;
  getLastRunMessageId: () => string | null;
  setLastRunMessageId: (id: string | null) => void;
  getLastActivityAt: () => number;
  setLastActivityAt: (ms: number) => void;
  narrationTrim: () => string;
  tailSlice: (count: number) => unknown[];
  getTimeline: () => Array<{ type: string; data: Record<string, unknown>; timestamp?: number }>;
  emitAgentProse: (raw: string, loopStep: number) => void;
  emit: (type: string, data: unknown) => void;
  configuredModel: () => LLMProvider;
  loopBudgetExceeded: () => boolean;
  returnResumableChunk: (
    steps: number,
    toolsUsed: Set<string>,
    options?: { buildFix?: boolean },
  ) => Promise<{
    ok: false;
    error: string;
    steps: number;
    resumable: true;
    buildFix?: boolean;
    toolsUsed: string[];
  }>;
  runDesignPreflightIfNeeded: () => Promise<void>;
  requiresFinalBuildGate: () => boolean;
  enabledApprovedPlanSteps: () => PlanStep[];
  isCanceled: () => Promise<boolean>;
  touchHeartbeat: () => Promise<void>;
  maybeEmitSilenceHeartbeat: () => void;
  bumpLlmRetries: () => Promise<number>;
  resetLlmRetries: () => Promise<void>;
  saveCheckpoint: (phase: LoopPhase, force?: boolean) => Promise<void>;
  persistFinal: (summary: string, opts?: PersistFinalOpts) => Promise<void>;
  persistPlanFinal: (summary: string, plan: ProposedPlan) => Promise<void>;
  clearCheckpoint: () => Promise<void>;
  persistAssistantStep: (response: ChatResponse) => Promise<string | null>;
  updateAssistantStep: (
    msgId: string,
    response: ChatResponse,
    execResults: Array<{ call: ToolCall; result: ToolResult }>,
    step: number,
  ) => Promise<void>;
  persistCheckpointChat: (steps: number, buildFix?: boolean) => Promise<void>;
  notifyLoopStatus: (ctx: LoopUpdateContext) => void;
  recordTouchedPath: (path: string) => void;
  finishClarify: (
    message: string,
    steps: number,
    toolsUsed: string[],
  ) => Promise<unknown>;
  attemptGracefulClosing: (
    reason: "tool_miss" | "build_fail" | "plan_stuck",
  ) => Promise<string | null>;
  emitTransition: (eventType: string, data?: unknown) => Promise<void>;
  llmChat: (
    model: LLMProvider,
    instruction: string,
    history: ChatMessage[],
    forceTools: boolean,
  ) => Promise<ChatResponse | null>;
  compressMessages: (messages: ChatMessage[]) => Promise<ChatMessage[]>;
  executeTool: (call: ToolCall) => Promise<ToolResult>;
  markToolsInvoked: () => void;
  onActivity: () => void;
  getPlanLlmResponseWasStreamed: () => boolean;
  setPlanLlmResponseWasStreamed: (value: boolean) => void;
};

export function buildPersistDeps(
  ctx: AgentLoopDepsContext,
  loopBudgetMs: number,
): AgentPersistDeps {
  return {
    sb: ctx.sb,
    runId: ctx.runId,
    state: ctx.state,
    getLastRunMessageId: ctx.getLastRunMessageId,
    setLastRunMessageId: ctx.setLastRunMessageId,
    getMaxStepsLimit: () => ctx.maxStepsLimit,
    getComplexityScore: () => ctx.complexityScore,
    touchedPaths: ctx.touchedPaths,
    narrationBuffer: ctx.narrationBuffer,
    tailSlice: ctx.tailSlice,
    getTimeline: ctx.getTimeline,
    runStartTime: ctx.runStartTime,
    getLastCheckpointStep: ctx.getLastCheckpointStep,
    setLastCheckpointStep: ctx.setLastCheckpointStep,
    emit: ctx.emit,
    loopBudgetMs,
  };
}

export function buildInfraDeps(
  ctx: AgentLoopDepsContext,
  loopBudgetMs: number,
): RunInfraDeps {
  return {
    sb: ctx.sb,
    runId: ctx.runId,
    runStartTime: ctx.runStartTime,
    loopBudgetMs,
    getLastActivityAt: ctx.getLastActivityAt,
    setLastActivityAt: ctx.setLastActivityAt,
    getMaxStepsLimit: () => ctx.maxStepsLimit,
    touchedPaths: ctx.touchedPaths,
    narrationTrim: ctx.narrationTrim,
    narrationBuffer: ctx.narrationBuffer,
    emit: ctx.emit,
    getPhase: () => ctx.state.phase,
    saveCheckpoint: ctx.saveCheckpoint,
    persistCheckpointChat: ctx.persistCheckpointChat,
  };
}

export function buildPlanTurnFinishDeps(ctx: AgentLoopDepsContext): PlanTurnFinishDeps {
  return {
    runId: ctx.runId,
    projectId: ctx.state.projectId,
    llmResponseWasStreamed: ctx.getLlmResponseWasStreamed(),
    emit: ctx.emit,
    configuredModel: ctx.configuredModel,
    persistFinal: ctx.persistFinal,
    persistPlanFinal: ctx.persistPlanFinal,
    clearCheckpoint: ctx.clearCheckpoint,
    emitTransition: ctx.emitTransition,
  };
}

export function buildExecuteDeps(
  ctx: AgentLoopDepsContext,
  toolsUsed: Set<string>,
  executionModel: LLMProvider,
): BuildExecuteDeps {
  return {
    approvedPlanBuild: ctx.approvedPlanBuild,
    approvedPlanSteps: ctx.approvedPlanSteps,
    getApprovedPlanStepIndex: ctx.getApprovedPlanStepIndex,
    setApprovedPlanStepIndex: ctx.setApprovedPlanStepIndex,
    buildFixResume: ctx.buildFixResume,
    originalUserRequest: ctx.originalUserRequest,
    projectTemplate: ctx.projectTemplate,
    maxStepsLimit: ctx.maxStepsLimit,
    state: ctx.state,
    toolsUsed,
    fileContentCache: ctx.fileContentCache,
    getToolMissCount: ctx.getToolMissCount,
    setToolMissCount: ctx.setToolMissCount,
    getForceToolsNext: ctx.getForceToolsNext,
    setForceToolsNext: ctx.setForceToolsNext,
    getToolsInvoked: ctx.getToolsInvoked,
    setToolsInvoked: ctx.setToolsInvoked,
    getConsecutiveNoContentReadSteps: ctx.getConsecutiveNoContentReadSteps,
    setConsecutiveNoContentReadSteps: ctx.setConsecutiveNoContentReadSteps,
    getLlmResponseWasStreamed: ctx.getLlmResponseWasStreamed,
    getLastExecutePhaseMessage: ctx.getLastExecutePhaseMessage,
    setLastExecutePhaseMessage: ctx.setLastExecutePhaseMessage,
    touchedPaths: ctx.touchedPaths,
    executionModel,
    reg: ctx.reg,
    compression: ctx.compression,
    observer: ctx.observer,
    router: ctx.router,
    emitAgentProse: ctx.emitAgentProse,
    narrationBuffer: ctx.narrationBuffer,
    emit: ctx.emit,
    loopBudgetExceeded: ctx.loopBudgetExceeded,
    returnResumableChunk: ctx.returnResumableChunk,
    runDesignPreflightIfNeeded: ctx.runDesignPreflightIfNeeded,
    requiresFinalBuildGate: ctx.requiresFinalBuildGate,
    enabledApprovedPlanSteps: ctx.enabledApprovedPlanSteps,
    isCanceled: ctx.isCanceled,
    touchHeartbeat: ctx.touchHeartbeat,
    maybeEmitSilenceHeartbeat: ctx.maybeEmitSilenceHeartbeat,
    bumpLlmRetries: ctx.bumpLlmRetries,
    resetLlmRetries: ctx.resetLlmRetries,
    saveCheckpoint: ctx.saveCheckpoint,
    persistFinal: ctx.persistFinal,
    clearCheckpoint: ctx.clearCheckpoint,
    persistAssistantStep: ctx.persistAssistantStep,
    updateAssistantStep: ctx.updateAssistantStep,
    notifyLoopStatus: ctx.notifyLoopStatus,
    recordTouchedPath: ctx.recordTouchedPath,
    finishClarify: ctx.finishClarify,
    attemptGracefulClosing: (reason) => ctx.attemptGracefulClosing(reason),
    emitTransition: ctx.emitTransition,
    llmChat: ctx.llmChat,
    getContextFiles: () => ctx.state.context?.files ?? [],
  };
}

export function buildPlanTurnDeps(
  ctx: AgentLoopDepsContext,
  skillPrompt: string,
): PlanTurnDeps {
  return {
    ...buildPlanTurnFinishDeps(ctx),
    robinActive: ctx.robinActive,
    originalUserRequest: ctx.originalUserRequest,
    state: ctx.state,
    context: ctx.state.context,
    intent: ctx.state.intent,
    complexityScore: ctx.complexityScore,
    projectTemplate: ctx.projectTemplate,
    stackAddon: ctx.stackAddon,
    sessionAddon: ctx.sessionAddon,
    tasteStart: ctx.tasteStart,
    skillPrompt,
    toolDefinitions: ctx.reg.getDefinitions(),
    streamState: ctx.planStreamState,
    compressMessages: ctx.compressMessages,
    loopBudgetExceeded: ctx.loopBudgetExceeded,
    returnResumableChunk: ctx.returnResumableChunk,
    saveCheckpoint: (phase) => ctx.saveCheckpoint(phase),
    attemptGracefulClosing: (reason) => ctx.attemptGracefulClosing(reason),
    executeTool: ctx.executeTool,
    markToolsInvoked: ctx.markToolsInvoked,
    onActivity: ctx.onActivity,
    getLlmResponseWasStreamed: ctx.getPlanLlmResponseWasStreamed,
    setLlmResponseWasStreamed: ctx.setPlanLlmResponseWasStreamed,
  };
}