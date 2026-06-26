// runtime/phases/execute.test.ts — Garantias do chat turn UX na fase execute.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runBuildExecutePhase, type BuildExecuteDeps } from "./execute.ts";
import { NarrationPhase } from "./narration.ts";
import type { AgentState, ChatMessage, ChatResponse, LLMProvider, PlanStep, ToolCall } from "../../types.ts";
import { LoopPhase } from "../../types.ts";

const minimalState = (): AgentState => ({
  projectId: "proj-1",
  conversationId: "conv-1",
  userId: "user-1",
  messages: [],
  currentStepIndex: 0,
  totalSteps: 0,
  phase: LoopPhase.GATHER_CONTEXT,
  executionLog: [],
  context: null,
  intent: null,
  plan: null,
  validationResults: [],
  retryFeedback: null,
});

const mockToolResult = { ok: true, output: "ok", error: "" };

function buildStubbedExecuteDeps(overrides?: {
  llmChat?: (
    model: LLMProvider,
    instruction: string,
    history: ChatMessage[],
    forceTools: boolean,
  ) => Promise<ChatResponse | null>;
}): BuildExecuteDeps {
  const events: { type: string; data: Record<string, unknown> }[] = [];
  const narration = new NarrationPhase(
    { approvedPlanBuild: false, buildFixResume: false },
    (type, data) => events.push({ type, data: data as Record<string, unknown> }),
  );
  let step = 0;
  const state = minimalState();

  const model: LLMProvider = {
    chat: async () => ({ role: "assistant" as const, content: "", tool_calls: [] }),
  };

  const deps: BuildExecuteDeps = {
    robinActive: false,
    approvedPlanBuild: false,
    approvedPlanSteps: [],
    designReadPathsDone: new Set(),
    getApprovedPlanStepIndex: () => 0,
    setApprovedPlanStepIndex: () => {},
    buildFixResume: false,
    originalUserRequest: "build app",
    projectTemplate: "vite-react",
    maxStepsLimit: 10,
    state,
    toolsUsed: new Set(),
    fileContentCache: new Map(),
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
    touchedPaths: new Set(),
    executionModel: model,
    reg: {
      execute: async () => mockToolResult,
    } as unknown as BuildExecuteDeps["reg"],
    compression: {
      compress: async (m: ChatMessage[]) => m,
      recordUsage: () => {},
      getTotalTokens: () => ({ input: 0, output: 0, total: 0 }),
      getEstimatedCostUsd: () => 0,
    } as unknown as BuildExecuteDeps["compression"],
    observer: {
      quickTypeCheck: async () => ({ ok: true, errors: [] }),
      observe: async () => ({ passed: true, checks: [] }),
    } as unknown as BuildExecuteDeps["observer"],
    router: {
      mainCfg: { model: "mock" },
    } as unknown as BuildExecuteDeps["router"],
    emitAgentProse: (raw, _loopStep) => narration.emitAgentProse(raw, _loopStep),
    ensureOpeningBeforeWork: (fallback) => narration.ensureOpeningBeforeWork(fallback),
    narrationPhase: narration,
    narrationBuffer: "",
    emit: (type, data) => events.push({ type, data: data as Record<string, unknown> }),
    loopBudgetExceeded: () => false,
    returnResumableChunk: async (steps) => ({
      ok: false,
      error: "resumable",
      steps,
      resumable: true,
      toolsUsed: [],
    }),
    runDesignPreflightIfNeeded: async () => {},
    requiresFinalBuildGate: () => false,
    enabledApprovedPlanSteps: () => [],
    isCanceled: async () => false,
    touchHeartbeat: async () => {},
    maybeEmitSilenceHeartbeat: () => {},
    bumpLlmRetries: async () => 0,
    resetLlmRetries: async () => {},
    saveCheckpoint: async () => {},
    persistFinal: async () => {},
    clearCheckpoint: async () => {},
    persistAssistantStep: async () => null,
    updateAssistantStep: async () => {},
    notifyLoopStatus: () => {},
    recordTouchedPath: () => {},
    finishClarify: async () => ({
      ok: false,
      error: "clarify",
      steps: 0,
      toolsUsed: [],
    }),
    attemptGracefulClosing: async () => null,
    emitTransition: async () => {},
    llmChat:
      overrides?.llmChat ??
      (async () => ({ role: "assistant" as const, content: "Vou começar.", tool_calls: [] })),
    getContextFiles: () => [],
  };
  (deps as unknown as { _events: () => typeof events })._events = () => events;
  (deps as unknown as { _narration: () => NarrationPhase })._narration = () => narration;
  return deps;
}

Deno.test("execute phase emits opening assistant_text before work", async () => {
  const deps = buildStubbedExecuteDeps();
  await runBuildExecutePhase(deps, 0);
  const events = (deps as unknown as { _events: () => { type: string; data: Record<string, unknown> }[] })._events();
  const firstOpening = events.findIndex((e) => e.type === "assistant_text" && e.data.opening === true);
  assert(firstOpening >= 0, "missing opening assistant_text");
});

Deno.test("execute phase fails fast when LLM never emits opening", async () => {
  const deps = buildStubbedExecuteDeps({
    llmChat: async () => ({ role: "assistant" as const, content: "", tool_calls: [] }),
  });
  const result = await runBuildExecutePhase(deps, 0);
  assertEquals(result.ok, false);
  assertEquals(result.error, "O modelo não respondeu com a mensagem esperada.");
});

Deno.test("execute success path emits final assistant_text", async () => {
  // Opening succeeds, then LLM responds with no tool_calls (agentTextComplete → break →
  // success path). Without requiresFinalBuildGate, finalGateOk becomes true and the
  // success path runs resolveClosureText + emits final assistant_text.
  let calls = 0;
  const deps = buildStubbedExecuteDeps({
    llmChat: async () => {
      calls += 1;
      if (calls === 1) {
        return { role: "assistant" as const, content: "Vou começar.", tool_calls: [] };
      }
      // After opening, inner loop calls llmChat once more — return a no-tool-call response
      // so the loop breaks with agentTextComplete=true.
      return { role: "assistant" as const, content: "Pronto.", tool_calls: [] };
    },
  });
  deps.requiresFinalBuildGate = () => false;
  const result = await runBuildExecutePhase(deps, 0);
  const events = (deps as unknown as { _events: () => { type: string; data: Record<string, unknown> }[] })._events();
  const finals = events.filter((e) => e.type === "assistant_text" && e.data.final === true);
  assert(finals.length > 0, "missing final assistant_text on success path");
  assertEquals(result.ok, true);
});
