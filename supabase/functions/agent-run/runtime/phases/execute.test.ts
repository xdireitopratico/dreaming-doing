// runtime/phases/execute.test.ts — Garantias do chat turn UX na fase execute.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runBuildExecutePhase, type BuildExecuteDeps } from "./execute.ts";
import { NarrationPhase } from "./narration.ts";
import type { AgentState, ChatMessage, ChatResponse, LLMProvider, PlanStep, ToolCall, ToolDefinition } from "../../types.ts";
import { LoopPhase } from "../../types.ts";
import { createCanonicalBuildSession, type CanonicalBuildSession } from "../build-session.ts";

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
    tools?: ToolDefinition[],
  ) => Promise<ChatResponse | null>;
}): BuildExecuteDeps {
  const events: { type: string; data: Record<string, unknown> }[] = [];
  const narration = new NarrationPhase(
    { approvedPlanBuild: false, buildFixResume: false },
    (type, data) => events.push({ type, data: data as Record<string, unknown> }),
  );
  let step = 0;
  let toolsInvoked = false;
  let toolMissCount = 0;
  const state = minimalState();
  let buildSession: CanonicalBuildSession | null = createCanonicalBuildSession("run-1", false);

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
    getToolMissCount: () => toolMissCount,
    setToolMissCount: (value) => {
      toolMissCount = value;
    },
    getForceToolsNext: () => false,
    setForceToolsNext: () => {},
    getToolsInvoked: () => toolsInvoked,
    setToolsInvoked: (value) => {
      toolsInvoked = value;
    },
    getConsecutiveNoContentReadSteps: () => 0,
    setConsecutiveNoContentReadSteps: () => {},
    getReadGateBlockCount: () => 0,
    setReadGateBlockCount: () => {},
    getLlmResponseWasStreamed: () => false,
    getLastExecutePhaseMessage: () => null,
    setLastExecutePhaseMessage: () => {},
    getBuildSession: () => buildSession,
    setBuildSession: (next) => {
      buildSession = next;
    },
    getDirectiveEmitted: () => false,
    setDirectiveEmitted: () => {},
    touchedPaths: new Set(),
    executionModel: model,
    reg: {
      execute: async () => mockToolResult,
      getDefinitions: () => [
        { name: "fs_read", description: "r", parameters: { type: "object", properties: {} } },
        { name: "fs_write", description: "w", parameters: { type: "object", properties: {} } },
        { name: "fs_edit", description: "e", parameters: { type: "object", properties: {} } },
        { name: "shell_exec", description: "s", parameters: { type: "object", properties: {} } },
      ],
    } as unknown as BuildExecuteDeps["reg"],
    compression: {
      emitUsage: () => {},
      shouldRunCompact: () => false,
      shouldInjectAdvisory: () => false,
      markAdvisoryInjected: () => {},
      buildAdvisoryMessage: () => "",
      prepareMessages: (m: ChatMessage[]) => m,
      runCompact: async (m: ChatMessage[]) => ({
        messages: m,
        beforeTokens: 0,
        afterTokens: 0,
      }),
      recordUsage: () => {},
      getTotalTokens: () => ({ input: 0, output: 0, total: 0 }),
      getEstimatedCostUsd: () => 0,
    } as unknown as BuildExecuteDeps["compression"],
    observer: {
      quickTypeCheck: async () => ({ ok: true, errors: [] }),
      observe: async () => ({ passed: true, checks: [] }),
      observeLight: async () => ({ passed: true, checks: [] }),
    } as unknown as BuildExecuteDeps["observer"],
    router: {
      mainCfg: { model: "mock" },
    } as unknown as BuildExecuteDeps["router"],
    emitAgentProse: (raw, _loopStep) => narration.emitAgentProse(raw, _loopStep),
    ensureOpeningBeforeWork: (fallback) => narration.ensureOpeningBeforeWork(fallback),
    narrationPhase: narration,
    narrationBuffer: "",
    emit: (type, data) => events.push({ type, data: data as Record<string, unknown> }),
    platformLimitExceeded: () => false,
    pauseOperationForUser: async (input) => {
      const text = input.message.trim() || "Pausado — continue quando estiver pronto.";
      events.push({ type: "assistant_text", data: { text, final: true, append: false } as any });
      if (typeof (deps as any).persistFinal === "function") {
        await (deps as any).persistFinal(text, { lastFinishOk: false, finished: false });
      }
      return {
        ok: false,
        error: text,
        steps: input.steps,
        resumable: false,
        awaiting: true,
        awaitingUser: { type: input.reason, message: text },
        toolsUsed: [...input.toolsUsed],
      };
    },
    runDesignPreflightIfNeeded: async () => null,
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

Deno.test("execute phase — text-only completion não emite opening (só antes de tools)", async () => {
  const deps = buildStubbedExecuteDeps();
  const result = await runBuildExecutePhase(deps, 0);
  const events = (deps as unknown as { _events: () => { type: string; data: Record<string, unknown> }[] })._events();
  const firstOpening = events.findIndex((e) => e.type === "assistant_text" && e.data.opening === true);
  assertEquals(result.ok, true);
  assertEquals(firstOpening, -1);
});

Deno.test("execute phase — stream vazio sem tools emite final sem opening espúrio", async () => {
  let calls = 0;
  const deps = buildStubbedExecuteDeps({
    llmChat: async () => {
      calls += 1;
      if (calls === 1) {
        return { role: "assistant" as const, content: "", tool_calls: [] };
      }
      return { role: "assistant" as const, content: "Terminei.", tool_calls: [] };
    },
  });
  const result = await runBuildExecutePhase(deps, 0);
  const events = (deps as unknown as { _events: () => { type: string; data: Record<string, unknown> }[] })._events();

  assertEquals(result.ok, true);
  assertEquals(result.resumable, undefined);
  assertEquals(result.buildFix, undefined);
  assert(calls >= 1, "at least one llm interaction");
  assertEquals(events.some((e) => e.type === "assistant_text" && e.data.opening === true), false);
  const finals = events.filter((e) => e.type === "assistant_text" && e.data.final === true);
  assert(finals.length > 0 && String((finals[0] as any).data?.text || "").length > 5);
});

Deno.test("execute phase — emite opening:true antes do primeiro batch de tools", async () => {
  let llmCalls = 0;
  const deps = buildStubbedExecuteDeps({
    llmChat: async () => {
      llmCalls += 1;
      if (llmCalls === 1) {
        return {
          role: "assistant" as const,
          content: "",
          tool_calls: [{
            id: "t1",
            name: "fs_read",
            arguments: { path: "src/App.tsx" },
          }],
        };
      }
      return { role: "assistant" as const, content: "Pronto.", tool_calls: [] };
    },
  });
  deps.executionModel = {
    chat: async () => ({
      role: "assistant" as const,
      content: "Vou ler o App.tsx primeiro.",
      tool_calls: [],
    }),
  };
  deps.requiresFinalBuildGate = () => false;
  deps.maxStepsLimit = 2;

  const result = await runBuildExecutePhase(deps, 0);
  const events = (deps as unknown as { _events: () => { type: string; data: Record<string, unknown> }[] })._events();
  const openingIdx = events.findIndex((e) => e.type === "assistant_text" && e.data.opening === true);
  const toolStartIdx = events.findIndex((e) => e.type === "tool_start");

  assertEquals(result.ok, true);
  assert(openingIdx >= 0, "missing opening:true before tools");
  if (toolStartIdx >= 0) {
    assert(openingIdx < toolStartIdx, "opening must precede tool_start");
  }
});

Deno.test("execute phase transforma preflight recuperavel em auto-repair sem terminal duplicado", async () => {
  const deps = buildStubbedExecuteDeps();
  let persistSummary = "";
  deps.runDesignPreflightIfNeeded = async () => ({
    status: "recoverable_fail",
    feedback: "PREFLIGHT FALHOU:\n[build] erro TS2307",
    checks: [{ name: "build", ok: false, output: "erro TS2307" }],
  });
  deps.persistFinal = async (summary) => {
    persistSummary = summary;
  };

  const result = await runBuildExecutePhase(deps, 0);
  const events = (deps as unknown as { _events: () => { type: string; data: Record<string, unknown> }[] })._events();

  assertEquals(result.ok, true);
  assertEquals(persistSummary.length > 0, true);
  assert(events.some((e) => e.type === "assistant_text" && e.data.final === true));
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

// Core regression test for the systematic "o modelo não respondeu com a mensagem esperada" failure.
// Drives the REAL exported runBuildExecutePhase with llmChat that ALWAYS returns empty content + no tools
// (simulates reasoning/partial/empty streams from any provider). Must still emit non-empty final prose,
// persistFinal with prose (never the error), and return ok/resumable state without the hardcore error.
Deno.test("execute phase with ALL empty LLM responses (content:null, no tools) still emits non-empty final prose and never hard-fails", async () => {
  let persistFinalArgs: any[] = [];
  const deps = buildStubbedExecuteDeps({
    llmChat: async () => ({ role: "assistant" as const, content: null, tool_calls: [] }),
  });
  deps.requiresFinalBuildGate = () => false;
  deps.persistFinal = async (summary: string, opts?: any) => {
    persistFinalArgs.push({ summary, opts });
  };
  const result = await runBuildExecutePhase(deps, 0);
  const events = (deps as unknown as { _events: () => { type: string; data: Record<string, unknown> }[] })._events();
  const finalTexts = events.filter((e) => e.type === "assistant_text" && e.data.final === true).map((e) => (e.data as any).text as string);
  const hasNonEmptyFinal = finalTexts.some((t) => typeof t === "string" && t.trim().length > 0);
  const noHardError = !result.error || !String(result.error).includes("O modelo não respondeu");
  const persistedGood = persistFinalArgs.some((p) => typeof p.summary === "string" && p.summary.trim().length > 0);

  assert(hasNonEmptyFinal, "must emit non-empty final assistant_text even when every LLM response was empty");
  assertEquals(noHardError, true);
  assertEquals(persistedGood, true);
  // success or clean resumable; never the terminal error status from the old path
  assert(result.ok === true || result.resumable === true || result.error === undefined || !String(result.error || "").includes("não respondeu"));
});

Deno.test("approved build — mantém tools completas e materializa arquivo", async () => {
  let calls = 0;
  const toolSets: string[][] = [];
  const fullToolNames = ["fs_edit", "fs_read", "fs_read_many", "fs_write", "shell_exec"];
  const deps = buildStubbedExecuteDeps({
    llmChat: async (_model, _instruction, _history, _forceTools, tools) => {
      calls += 1;
      toolSets.push((tools ?? []).map((t) => t.name).sort());
      if (calls <= 2) {
        return {
          role: "assistant" as const,
          content: "",
          tool_calls: [{
            id: `r${calls}`,
            name: "fs_read_many",
            arguments: { paths: ["src/App.tsx"] },
          }],
        };
      }
      if (calls === 3) {
        return {
          role: "assistant" as const,
          content: "",
          tool_calls: [{
            id: "w1",
            name: "fs_write",
            arguments: { path: "src/App.tsx", content: "export default function App() { return <div />; }" },
          }],
        };
      }
      return { role: "assistant" as const, content: "Pronto.", tool_calls: [] };
    },
  });
  deps.approvedPlanBuild = true;
  deps.requiresFinalBuildGate = () => false;
  deps.recordTouchedPath = (path) => {
    if (path) deps.touchedPaths.add(path);
  };
  deps.reg = {
    execute: async () => mockToolResult,
    getDefinitions: () => [
      { name: "fs_read", description: "r", parameters: { type: "object", properties: {} } },
      { name: "fs_read_many", description: "rm", parameters: { type: "object", properties: {} } },
      { name: "fs_write", description: "w", parameters: { type: "object", properties: {} } },
      { name: "fs_edit", description: "e", parameters: { type: "object", properties: {} } },
      { name: "shell_exec", description: "s", parameters: { type: "object", properties: {} } },
    ],
  } as unknown as BuildExecuteDeps["reg"];

  const result = await runBuildExecutePhase(deps, 0);
  assert(
    toolSets.every((names) => names.join(",") === fullToolNames.join(",")),
    `expected full tools every turn, got: ${JSON.stringify(toolSets)}`,
  );
  assert(deps.touchedPaths.size > 0, "approved build must materialize at least one file");
  // Approved build enforces tool calls on text-only turns; may pause at step_limit instead of ok.
  assert(result.ok === true || result.awaiting === true);
});

Deno.test("execute platform limit pausa aguardando usuário com persistFinal", async () => {
  let persistArgs: any[] = [];
  const deps = buildStubbedExecuteDeps({
    llmChat: async () => ({ role: "assistant" as const, content: "step", tool_calls: [] }),
  });
  (deps as any).state.messages = [{ role: "assistant", content: "Fiz uma edição inicial no header." }];
  (deps as any).touchedPaths = new Set(["src/Header.tsx"]);
  (deps as any).originalUserRequest = "adicionar header";
  deps.requiresFinalBuildGate = () => false;
  deps.persistFinal = async (summary: string, opts?: any) => { persistArgs.push({ summary, opts }); };
  let limitHits = 0;
  deps.platformLimitExceeded = () => { limitHits++; return limitHits > 0; };
  const result = await runBuildExecutePhase(deps, 0);
  const events = (deps as unknown as { _events: () => { type: string; data: Record<string, unknown> }[] })._events();
  const proseEmits = events.filter((e) => e.type === "assistant_text" && typeof (e.data as any).text === "string");
  const finalTrue = proseEmits.some((e) => (e.data as any).final === true);

  assert(finalTrue, "platform limit pause must emit final assistant_text");
  assert(persistArgs.some((p) => typeof p.summary === "string" && p.summary.trim().length > 0), "must call persistFinal");
  assertEquals(result.awaiting, true);
  assertEquals(result.resumable, false);
  assert(!String(result.error || "").includes("O modelo não respondeu"));
});

Deno.test("e3b71248 — reads + shell JSON no prose não completa em 2 steps", async () => {
  let llmCalls = 0;
  const readPaths = [
    "packages/forge-ui/src/compositions/opinionated/KineticHeadlineReveal.tsx",
    "packages/forge-ui/src/compositions/opinionated/GlassNavFloating.tsx",
    "packages/forge-ui/src/compositions/opinionated/HeroCinematicSpotlight.tsx",
    "packages/forge-ui/src/compositions/opinionated/FeatureBentoGrid.tsx",
    "packages/forge-ui/src/compositions/opinionated/FooterMinimalLegal.tsx",
  ];
  const shellJson =
    'Vou montar a estrutura.\n{"tool":"shell","command":"mkdir -p src/components/hero"}';
  const deps = buildStubbedExecuteDeps({
    llmChat: async () => {
      llmCalls += 1;
      if (llmCalls === 1) {
        return {
          role: "assistant" as const,
          content: "",
          tool_calls: readPaths.map((path, i) => ({
            id: `read-${i}`,
            name: "fs_read" as const,
            arguments: { path },
          })),
        };
      }
      return {
        role: "assistant" as const,
        content: shellJson,
        tool_calls: [],
      };
    },
  });
  deps.state.intent = {
    type: "modify",
    scope: ["src"],
    complexity: "medium",
    summary: "clone livekit",
  };
  deps.approvedPlanBuild = true;
  deps.approvedPlanDesign = {
    moment: "hero cinematic",
    techniques: ["glass"],
    read_paths: readPaths,
  } as BuildExecuteDeps["approvedPlanDesign"];
  deps.requiresFinalBuildGate = () => false;
  deps.maxStepsLimit = 8;
  deps.executionModel = {
    chat: async () => ({
      role: "assistant" as const,
      content: "Vou aplicar o design da biblioteca no hero.",
      tool_calls: [],
    }),
  };

  const result = await runBuildExecutePhase(deps, 0);

  assertEquals(result.ok, false);
  assertEquals(result.awaiting, true);
  assert(llmCalls > 2, "must retry after blocked text_only, not complete in 2 LLM turns");
});
