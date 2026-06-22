import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildExecuteDeps,
  buildPlanTurnFinishDeps,
  createDepsContext,
  createLoopBindings,
  type AgentLoopHost,
  type AgentLoopDepsContext,
} from "./deps-factory.ts";
import { LoopPhase } from "../types.ts";

function mockDepsContext(overrides?: Partial<AgentLoopDepsContext>): AgentLoopDepsContext {
  const state = {
    projectId: "proj-1",
    conversationId: "conv-1",
    messages: [],
    phase: LoopPhase.GATHER_CONTEXT,
    currentStepIndex: 0,
    executionLog: [],
    context: null,
    intent: null,
  };
  return {
    sb: {},
    runId: "run-1",
    state,
    reg: { getDefinitions: () => [], execute: async () => ({ ok: true }) } as AgentLoopDepsContext["reg"],
    compression: { compress: async (m) => m } as AgentLoopDepsContext["compression"],
    observer: {} as AgentLoopDepsContext["observer"],
    router: {} as AgentLoopDepsContext["router"],
    robinActive: false,
    projectTemplate: "vite-react",
    stackAddon: "",
    sessionAddon: "",
    tasteStart: false,
    maxStepsLimit: 60,
    complexityScore: 3,
    originalUserRequest: "crie landing",
    approvedPlanBuild: false,
    approvedPlanSteps: [],
    buildFixResume: false,
    planStreamState: { llmResponseWasStreamed: false, thinkingStreamStartedAt: null },
    fileContentCache: new Map(),
    touchedPaths: new Set(),
    narrationBuffer: "",
    runStartTime: Date.now(),
    getLastCheckpointStep: () => 0,
    setLastCheckpointStep: () => {},
    getApprovedPlanStepIndex: () => 0,
    setApprovedPlanStepIndex: () => {},
    getToolMissCount: () => 0,
    setToolMissCount: () => {},
    getForceToolsNext: () => false,
    setForceToolsNext: () => {},
    getToolsInvoked: () => false,
    setToolsInvoked: () => {},
    getConsecutiveNoContentReadSteps: () => 0,
    setConsecutiveNoContentReadSteps: () => {},
    getLlmResponseWasStreamed: () => false,
    getLastExecutePhaseMessage: () => null,
    setLastExecutePhaseMessage: () => {},
    getLastRunMessageId: () => null,
    setLastRunMessageId: () => {},
    getLastActivityAt: () => Date.now(),
    setLastActivityAt: () => {},
    narrationTrim: () => "",
    tailSlice: () => [],
    getTimeline: () => [],
    emitAgentProse: () => {},
    emit: () => {},
    configuredModel: () => {
      throw new Error("not used");
    },
    loopBudgetExceeded: () => false,
    returnResumableChunk: async () => ({
      ok: false as const,
      error: "chunk",
      steps: 0,
      resumable: true as const,
      toolsUsed: [],
    }),
    runDesignPreflightIfNeeded: async () => {},
    requiresFinalBuildGate: () => false,
    enabledApprovedPlanSteps: () => [],
    isCanceled: async () => false,
    touchHeartbeat: async () => {},
    maybeEmitSilenceHeartbeat: () => {},
    bumpLlmRetries: async () => 1,
    resetLlmRetries: async () => {},
    saveCheckpoint: async () => {},
    persistFinal: async () => {},
    persistPlanFinal: async () => {},
    clearCheckpoint: async () => {},
    persistAssistantStep: async () => null,
    updateAssistantStep: async () => {},
    persistCheckpointChat: async () => {},
    notifyLoopStatus: () => {},
    recordTouchedPath: () => {},
    finishClarify: async () => ({ ok: true, steps: 0, toolsUsed: [] }),
    attemptGracefulClosing: async () => null,
    emitTransition: async () => {},
    llmChat: async () => null,
    compressMessages: async (m) => m,
    executeTool: async () => ({ ok: true }),
    markToolsInvoked: () => {},
    onActivity: () => {},
    getPlanLlmResponseWasStreamed: () => false,
    setPlanLlmResponseWasStreamed: () => {},
    ...overrides,
  };
}

Deno.test("buildPlanTurnFinishDeps — projectId e runId", () => {
  const deps = buildPlanTurnFinishDeps(mockDepsContext());
  assertEquals(deps.runId, "run-1");
  assertEquals(deps.projectId, "proj-1");
});

Deno.test("buildExecuteDeps — repassa template e toolsUsed", () => {
  const toolsUsed = new Set(["fs_read"]);
  const model = { chat: async () => ({ content: "" }) };
  const deps = buildExecuteDeps(mockDepsContext(), toolsUsed, model);
  assertEquals(deps.projectTemplate, "vite-react");
  assertEquals(deps.toolsUsed, toolsUsed);
  assertEquals(deps.executionModel, model);
});

function mockHost(overrides?: Partial<AgentLoopHost>): AgentLoopHost {
  const state = {
    projectId: "proj-1",
    conversationId: "conv-1",
    messages: [],
    phase: LoopPhase.GATHER_CONTEXT,
    currentStepIndex: 0,
    executionLog: [],
    context: null,
    intent: null,
  };
  let checkpointStep = 0;
  let emitted: Array<{ type: string; data: unknown }> = [];
  const host: AgentLoopHost = {
    sb: {},
    runId: "run-host",
    state,
    reg: { getDefinitions: () => [], execute: async () => ({ ok: true }) } as AgentLoopHost["reg"],
    compression: { compress: async (m) => m } as AgentLoopHost["compression"],
    observer: {} as AgentLoopHost["observer"],
    router: {} as AgentLoopHost["router"],
    robinActive: false,
    projectTemplate: "nextjs",
    stackAddon: "tailwind",
    sessionAddon: "",
    tasteStart: false,
    maxStepsLimit: 40,
    complexityScore: 5,
    originalUserRequest: "build app",
    approvedPlanBuild: true,
    approvedPlanSteps: [],
    buildFixResume: false,
    planStreamState: { llmResponseWasStreamed: false, thinkingStreamStartedAt: null },
    fileContentCache: new Map(),
    touchedPaths: new Set(["src/App.tsx"]),
    narrationBuffer: "note",
    runStartTime: Date.now() - 1000,
    getLastCheckpointStep: () => checkpointStep,
    setLastCheckpointStep: (step) => {
      checkpointStep = step;
    },
    getApprovedPlanStepIndex: () => 0,
    setApprovedPlanStepIndex: () => {},
    getToolMissCount: () => 0,
    setToolMissCount: () => {},
    getForceToolsNext: () => false,
    setForceToolsNext: () => {},
    getToolsInvoked: () => false,
    setToolsInvoked: () => {},
    getConsecutiveNoContentReadSteps: () => 0,
    setConsecutiveNoContentReadSteps: () => {},
    getLlmResponseWasStreamed: () => false,
    getLastExecutePhaseMessage: () => null,
    setLastExecutePhaseMessage: () => {},
    getLastRunMessageId: () => null,
    setLastRunMessageId: () => {},
    getLastActivityAt: () => Date.now(),
    setLastActivityAt: () => {},
    narrationTrim: () => "trimmed",
    tailSlice: (count) => Array(count).fill("x"),
    getTimeline: () => [{ type: "tool_start", data: {} }],
    emitAgentProse: () => {},
    emit: (type, data) => {
      emitted.push({ type, data });
    },
    configuredModel: () => ({ chat: async () => ({ content: "" }) }),
    gatherContext: async () => {},
    runDesignPreflightIfNeeded: async () => {},
    requiresFinalBuildGate: () => true,
    enabledApprovedPlanSteps: () => [],
    isCanceled: async () => false,
    notifyLoopStatus: () => {},
    recordTouchedPath: () => {},
    attemptGracefulClosing: async () => null,
    emitTransition: async () => {},
    llmChat: async () => null,
    compressMessages: async (m) => m,
    executeTool: async () => ({ ok: true }),
    markToolsInvoked: () => {},
    onActivity: () => {},
    getPlanLlmResponseWasStreamed: () => false,
    setPlanLlmResponseWasStreamed: () => {},
    ...overrides,
  };
  return Object.assign(host, { _emitted: () => emitted });
}

Deno.test("createDepsContext — preserva binding de emit do host", () => {
  const host = mockHost();
  const ctx = createDepsContext(host, 60_000);
  ctx.emit("ping", { ok: true });
  assertEquals((host as { _emitted: () => Array<{ type: string }> })._emitted().length, 1);
  assertEquals(ctx.projectTemplate, "nextjs");
  assertEquals(ctx.narrationTrim(), "trimmed");
});

Deno.test("createLoopBindings — buildExecute repassa host state", () => {
  const host = mockHost();
  const bindings = createLoopBindings(host, 60_000);
  const toolsUsed = new Set(["fs_write"]);
  const model = { chat: async () => ({ content: "" }) };
  const exec = bindings.buildExecute(toolsUsed, model);
  assertEquals(exec.approvedPlanBuild, true);
  assertEquals(exec.projectTemplate, "nextjs");
  assertEquals(exec.toolsUsed, toolsUsed);
  assertEquals(bindings.deps().runId, "run-host");
});