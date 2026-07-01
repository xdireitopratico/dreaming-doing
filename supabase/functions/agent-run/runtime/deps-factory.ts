// runtime/deps-factory.ts — Factories de deps para fases do loop (Fase 2.2)
import type { CompressionManager } from "../compression.ts";
import type { RuntimeObserver } from "../observer.ts";
import type { ModelRouter } from "../router.ts";
import type { LoopUpdateContext } from "../loop-status.ts";
import type { ToolRegistry } from "../registry.ts";
import type {
  AgentState,
  ChatMessage,
  ChatResponse,
  LLMProvider,
  PlanStep,
  ProposedPlan,
  ToolCall,
  ToolResult,
} from "../types.ts";
import { LoopPhase } from "../types.ts";
import {
  bumpLlmRetries,
  loopBudgetExceeded,
  maybeEmitSilenceHeartbeat,
  resetLlmRetries,
  returnResumableChunk,
  touchHeartbeat,
  type ResumableChunkResult,
} from "./infra.ts";
import {
  clearCheckpoint,
  persistAssistantStep,
  persistCheckpointChat,
  persistFinal,
  persistPlanFinal,
  saveCheckpoint,
  updateAssistantStep,
} from "./phases/persist.ts";
import { finishClarify } from "./phases/plan-turn.ts";
import type { RunInfraDeps } from "./infra.ts";
import { returnResumableChunk, returnResumableWithUserMessage as infraReturnResumableWithUserMessage } from "./infra.ts";
import type { AgentPersistDeps, PersistFinalOpts } from "./phases/persist.ts";
import type { BuildExecuteDeps } from "./phases/execute.ts";
import type {
  PlanModeStreamState,
  PlanTurnDeps,
  PlanTurnFinishDeps,
  PlanTurnRunResult,
} from "./phases/plan-turn.ts";
import type { AgentLoopMutableState } from "./loop-mutable-state.ts";
import type { CanonicalBuildSession } from "./build-session.ts";

function mutableAccessors(mutable: AgentLoopMutableState) {
  return {
    getLastCheckpointStep: () => mutable.lastCheckpointStep,
    setLastCheckpointStep: (step: number) => {
      mutable.lastCheckpointStep = step;
    },
    getApprovedPlanStepIndex: () => mutable.approvedPlanStepIndex,
    setApprovedPlanStepIndex: (index: number) => {
      mutable.approvedPlanStepIndex = index;
    },
    getToolMissCount: () => mutable.toolMissCount,
    setToolMissCount: (count: number) => {
      mutable.toolMissCount = count;
    },
    getForceToolsNext: () => mutable.forceToolsNext,
    setForceToolsNext: (value: boolean) => {
      mutable.forceToolsNext = value;
    },
    getToolsInvoked: () => mutable.toolsInvoked,
    setToolsInvoked: (value: boolean) => {
      mutable.toolsInvoked = value;
    },
    getConsecutiveNoContentReadSteps: () => mutable.consecutiveNoContentReadSteps,
    setConsecutiveNoContentReadSteps: (value: number) => {
      mutable.consecutiveNoContentReadSteps = value;
    },
    getLlmResponseWasStreamed: () => mutable.llmResponseWasStreamed,
    getLastExecutePhaseMessage: () => mutable.lastExecutePhaseMessage,
    setLastExecutePhaseMessage: (value: string | null) => {
      mutable.lastExecutePhaseMessage = value;
    },
    getLastRunMessageId: () => mutable.lastRunMessageId,
    setLastRunMessageId: (id: string | null) => {
      mutable.lastRunMessageId = id;
    },
    getLastActivityAt: () => mutable.lastActivityAt,
    setLastActivityAt: (ms: number) => {
      mutable.lastActivityAt = ms;
    },
    getBuildSession: () => mutable.buildSession,
    setBuildSession: (session: CanonicalBuildSession | null) => {
      mutable.buildSession = session;
    },
  };
}

/** Superfície do AgentLoop exposta ao factory — evita depsContext() gigante no loop. */
export type AgentLoopHost = {
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
  approvedPlanDesign?: import("../types.ts").DesignPlanField;
  buildFixResume: boolean;
  planStreamState: PlanModeStreamState;
  fileContentCache: Map<string, string>;
  touchedPaths: Set<string>;
  narrationBuffer: string;
  runStartTime: number;
  mutable: AgentLoopMutableState;
  narrationTrim: () => string;
  tailSlice: (count: number) => unknown[];
  getTimeline: () => Array<{ type: string; data: Record<string, unknown>; timestamp?: number }>;
  emitAgentProse: (raw: string, loopStep: number) => void;
  ensureOpeningBeforeWork: (fallback: string) => void;
  emit: (type: string, data: unknown) => void;
  configuredModel: () => LLMProvider;
  gatherContext: () => Promise<void>;
  runDesignPreflightIfNeeded: () => Promise<unknown>;
  requiresFinalBuildGate: () => boolean;
  enabledApprovedPlanSteps: () => PlanStep[];
  isCanceled: () => Promise<boolean>;
  notifyLoopStatus: (ctx: LoopUpdateContext) => void;
  recordTouchedPath: (path: string) => void;
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
  approvedPlanDesign?: import("../types.ts").DesignPlanField;
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
  getBuildSession: () => CanonicalBuildSession | null;
  setBuildSession: (session: CanonicalBuildSession | null) => void;
  narrationTrim: () => string;
  tailSlice: (count: number) => unknown[];
  getTimeline: () => Array<{ type: string; data: Record<string, unknown>; timestamp?: number }>;
  emitAgentProse: (raw: string, loopStep: number) => void;
  ensureOpeningBeforeWork: (fallback: string) => void;
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
  runDesignPreflightIfNeeded: () => Promise<unknown>;
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
    clarifyQuestions?: Array<{
      id: string;
      intro?: string;
      question: string;
      multiple?: boolean;
      choices: Array<{ id: string; label: string; description?: string }>;
    }>,
  ) => Promise<PlanTurnRunResult>;
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
    getBuildSession: ctx.getBuildSession,
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
    getBuildSession: ctx.getBuildSession,
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
  designReadPathsDone: Set<string>,
): BuildExecuteDeps {
  return {
    robinActive: ctx.robinActive,
    approvedPlanBuild: ctx.approvedPlanBuild,
    approvedPlanSteps: ctx.approvedPlanSteps,
    approvedPlanDesign: ctx.approvedPlanDesign,
    designReadPathsDone,
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
    getBuildSession: ctx.getBuildSession,
    setBuildSession: ctx.setBuildSession,
    touchedPaths: ctx.touchedPaths,
    executionModel,
    reg: ctx.reg,
    compression: ctx.compression,
    observer: ctx.observer,
    router: ctx.router,
    emitAgentProse: ctx.emitAgentProse,
    ensureOpeningBeforeWork: ctx.ensureOpeningBeforeWork,
    narrationBuffer: ctx.narrationBuffer,
    emit: ctx.emit,
    loopBudgetExceeded: ctx.loopBudgetExceeded,
    returnResumableChunk: ctx.returnResumableChunk,
    returnResumableWithUserMessage: ctx.returnResumableWithUserMessage,
    runDesignPreflightIfNeeded: ctx.runDesignPreflightIfNeeded as BuildExecuteDeps["runDesignPreflightIfNeeded"],
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
    returnResumableWithUserMessage: ctx.returnResumableWithUserMessage,
    saveCheckpoint: (phase) => ctx.saveCheckpoint(phase),
    attemptGracefulClosing: (reason) => ctx.attemptGracefulClosing(reason),
    executeTool: ctx.executeTool,
    markToolsInvoked: ctx.markToolsInvoked,
    onActivity: ctx.onActivity,
    ensureOpeningBeforeWork: ctx.ensureOpeningBeforeWork,
    getLlmResponseWasStreamed: ctx.getPlanLlmResponseWasStreamed,
    setLlmResponseWasStreamed: ctx.setPlanLlmResponseWasStreamed,
  };
}

export function createDepsContext(
  host: AgentLoopHost,
  loopBudgetMs: number,
): AgentLoopDepsContext {
  let ctx!: AgentLoopDepsContext;
  const persistDeps = () => buildPersistDeps(ctx, loopBudgetMs);
  const infraDeps = () => buildInfraDeps(ctx, loopBudgetMs);
  const accessors = mutableAccessors(host.mutable);

  ctx = {
    sb: host.sb,
    runId: host.runId,
    state: host.state,
    reg: host.reg,
    compression: host.compression,
    observer: host.observer,
    router: host.router,
    robinActive: host.robinActive,
    projectTemplate: host.projectTemplate,
    stackAddon: host.stackAddon,
    sessionAddon: host.sessionAddon,
    tasteStart: host.tasteStart,
    maxStepsLimit: host.maxStepsLimit,
    complexityScore: host.complexityScore,
    originalUserRequest: host.originalUserRequest,
    approvedPlanBuild: host.approvedPlanBuild,
    approvedPlanSteps: host.approvedPlanSteps,
    approvedPlanDesign: host.approvedPlanDesign,
    buildFixResume: host.buildFixResume,
    planStreamState: host.planStreamState,
    fileContentCache: host.fileContentCache,
    touchedPaths: host.touchedPaths,
    narrationBuffer: host.narrationBuffer,
    runStartTime: host.runStartTime,
    ...accessors,
    narrationTrim: () => host.narrationTrim(),
    tailSlice: (count) => host.tailSlice(count),
    getTimeline: () => host.getTimeline(),
    emitAgentProse: (raw, loopStep) => host.emitAgentProse(raw, loopStep),
    ensureOpeningBeforeWork: (fallback) => host.ensureOpeningBeforeWork(fallback),
    emit: (type, data) => host.emit(type, data),
    configuredModel: () => host.configuredModel(),
    loopBudgetExceeded: () =>
      loopBudgetExceeded({ runStartTime: host.runStartTime, loopBudgetMs }),
    returnResumableChunk: (steps, used, options) =>
      returnResumableChunk(infraDeps(), steps, used, options),
    runDesignPreflightIfNeeded: () => host.runDesignPreflightIfNeeded(),
    requiresFinalBuildGate: () => host.requiresFinalBuildGate(),
    enabledApprovedPlanSteps: () => host.enabledApprovedPlanSteps(),
    isCanceled: () => host.isCanceled(),
    touchHeartbeat: () => touchHeartbeat(infraDeps()),
    maybeEmitSilenceHeartbeat: () => maybeEmitSilenceHeartbeat(infraDeps()),
    bumpLlmRetries: () => bumpLlmRetries(infraDeps()),
    resetLlmRetries: () => resetLlmRetries(infraDeps()),
    saveCheckpoint: (phase, force) => saveCheckpoint(persistDeps(), phase, force),
    persistFinal: (summary, opts) => persistFinal(persistDeps(), summary, opts),
    persistPlanFinal: (summary, plan) => persistPlanFinal(persistDeps(), summary, plan),
    clearCheckpoint: () => clearCheckpoint(persistDeps()),
    persistAssistantStep: (response) => persistAssistantStep(persistDeps(), response),
    updateAssistantStep: (msgId, response, execResults, step) =>
      updateAssistantStep(persistDeps(), msgId, response, execResults, step),
    persistCheckpointChat: (steps, buildFix) =>
      persistCheckpointChat(persistDeps(), steps, buildFix),
    notifyLoopStatus: (ctx) => host.notifyLoopStatus(ctx),
    recordTouchedPath: (path) => host.recordTouchedPath(path),
    finishClarify: (message, steps, used, clarifyQuestions) =>
      finishClarify(buildPlanTurnFinishDeps(ctx), message, steps, used, clarifyQuestions),
    attemptGracefulClosing: (reason) => host.attemptGracefulClosing(reason),
    emitTransition: (eventType, data) => host.emitTransition(eventType, data),
    llmChat: (model, instruction, history, forceTools) =>
      host.llmChat(model, instruction, history, forceTools),
    compressMessages: (messages) => host.compressMessages(messages),
    executeTool: (call) => host.executeTool(call),
    markToolsInvoked: () => host.markToolsInvoked(),
    onActivity: () => host.onActivity(),
    getPlanLlmResponseWasStreamed: () => host.getPlanLlmResponseWasStreamed(),
    setPlanLlmResponseWasStreamed: (value) => host.setPlanLlmResponseWasStreamed(value),
  };
  return ctx;
}

export type LoopBindings = {
  deps: () => AgentLoopDepsContext;
  persistFinal: (summary: string, opts?: PersistFinalOpts) => Promise<void>;
  clearCheckpoint: () => Promise<void>;
  saveCheckpoint: (phase: LoopPhase, force?: boolean) => Promise<void>;
  touchHeartbeat: () => Promise<void>;
  returnResumableChunk: (
    steps: number,
    toolsUsed: Set<string>,
    options?: { buildFix?: boolean },
  ) => Promise<ResumableChunkResult>;
  returnResumableWithUserMessage: (
    steps: number,
    toolsUsed: Set<string>,
    options?: { buildFix?: boolean },
    prose?: string,
  ) => Promise<ResumableChunkResult>;
  buildExecute: (
    toolsUsed: Set<string>,
    executionModel: LLMProvider,
    designReadPathsDone: Set<string>,
  ) => BuildExecuteDeps;
  buildPlanTurn: (skillPrompt: string) => PlanTurnDeps;
  planTurnFinish: () => PlanTurnFinishDeps;
};

export function createLoopBindings(
  host: AgentLoopHost,
  loopBudgetMs: number,
): LoopBindings {
  const deps = () => createDepsContext(host, loopBudgetMs);
  const persistDeps = () => buildPersistDeps(deps(), loopBudgetMs);
  const infraDeps = () => buildInfraDeps(deps(), loopBudgetMs);

  return {
    deps,
    persistFinal: (summary, opts) => persistFinal(persistDeps(), summary, opts),
    clearCheckpoint: () => clearCheckpoint(persistDeps()),
    saveCheckpoint: (phase, force) => saveCheckpoint(persistDeps(), phase, force),
    touchHeartbeat: () => touchHeartbeat(infraDeps()),
    returnResumableChunk: (steps, used, options) =>
      returnResumableChunk(infraDeps(), steps, used, options),
    returnResumableWithUserMessage: (steps, used, options, prose) =>
      infraReturnResumableWithUserMessage(infraDeps(), (s, o) => persistFinal(persistDeps(), s, o), steps, used, options, prose),
    buildExecute: (toolsUsed, model, designReadPathsDone) =>
      buildExecuteDeps(deps(), toolsUsed, model, designReadPathsDone),
    buildPlanTurn: (skillPrompt) => buildPlanTurnDeps(deps(), skillPrompt),
    planTurnFinish: () => buildPlanTurnFinishDeps(deps()),
  };
}
