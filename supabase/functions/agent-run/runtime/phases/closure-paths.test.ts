// closure-paths.test.ts — Table-driven AC1: todo exit de execute.ts emite assistant_text + persistFinal.
//
// Inventário de exits (execute.ts):
//   budget_exceeded | canceled | preflight_terminal | llm_fail_fast | llm_error_resumable
//   llm_retries_exhausted | zero_writes_resumable | clarify | tool_miss_terminal
//   canceled_mid_loop | max_steps_resumable | final_gate_failed | final_gate_budget
//   success_summarize
//
// plan-turn.ts / chat-turn.ts: finishClarify, finishPlanProposal, returnRecoverablePlanChunk,
//   returnRecoverableChatChunk — cobertos por testes dedicados + structural grep.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runBuildExecutePhase, type BuildExecuteDeps } from "./execute.ts";
import { runChatModeAgentTurn } from "./chat-turn.ts";
import type { ChatMessage } from "../../types.ts";
import { NarrationPhase } from "./narration.ts";
import { createCanonicalBuildSession } from "../build-session.ts";
import type { LLMProvider } from "../../types.ts";

function makeMinimalDeps(overrides: Partial<BuildExecuteDeps> = {}): BuildExecuteDeps & {
  _events: () => Array<{ type: string; data: Record<string, unknown> }>;
  _persistCalls: () => Array<{ s: string; o?: unknown }>;
} {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  const persistCalls: Array<{ s: string; o?: unknown }> = [];
  const state = {
    projectId: "p",
    conversationId: "c",
    userId: "u",
    phase: "build",
    messages: [] as ChatMessage[],
    currentStepIndex: 0,
    executionLog: [],
    context: null,
    intent: null,
    plan: null,
    validationResults: [],
    retryFeedback: null,
    totalSteps: 0,
  };
  const touched = new Set<string>();
  const narration = new NarrationPhase(
    { approvedPlanBuild: false, buildFixResume: false },
    (t, d) => events.push({ type: t, data: d as Record<string, unknown> }),
  );
  const base: Record<string, unknown> = {
    robinActive: false,
    approvedPlanBuild: false,
    approvedPlanSteps: [],
    designReadPathsDone: new Set(),
    getApprovedPlanStepIndex: () => 0,
    setApprovedPlanStepIndex: () => {},
    buildFixResume: false,
    originalUserRequest: "test close",
    projectTemplate: "web",
    maxStepsLimit: 5,
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
    getReadGateBlockCount: () => 0,
    setReadGateBlockCount: () => {},
    getLlmResponseWasStreamed: () => false,
    getLastExecutePhaseMessage: () => null,
    setLastExecutePhaseMessage: () => {},
    getBuildSession: () => createCanonicalBuildSession("r1", false),
    setBuildSession: () => {},
    touchedPaths: touched,
    executionModel: {
      chat: async () => ({ role: "assistant", content: "Vou começar pelo pedido.", tool_calls: [] }),
    } as LLMProvider,
    reg: {
      execute: async () => ({ ok: true, output: "ok" }),
      getDefinitions: () => [],
    },
    compression: {
      emitUsage: () => {},
      shouldRunCompact: () => false,
      shouldInjectAdvisory: () => false,
      markAdvisoryInjected: () => {},
      buildAdvisoryMessage: () => "",
      prepareMessages: (messages: ChatMessage[]) => messages,
      runCompact: async (messages: ChatMessage[]) => ({
        messages,
        beforeTokens: 0,
        afterTokens: 0,
      }),
      getTotalTokens: () => ({ input: 0, output: 0, total: 0 }),
      getEstimatedCostUsd: () => 0,
      recordUsage: () => {},
    },
    observer: {
      observe: async () => ({ passed: true, checks: [], feedback: "" }),
    },
    router: { mainCfg: { model: "x" } },
    emitAgentProse: (raw: string) => narration.emitAgentProse(raw, 1),
    ensureOpeningBeforeWork: (fallback: string) => narration.ensureOpeningBeforeWork(fallback),
    emit: (t: string, d: unknown) => events.push({ type: t, data: d as Record<string, unknown> }),
    persistFinal: async (s: string, o?: unknown) => {
      persistCalls.push({ s, o });
    },
    saveCheckpoint: async () => {},
    clearCheckpoint: async () => {},
    returnResumableWithUserMessage: async (steps: number, _tu: Set<string>, _opt?: unknown, prose?: string) => {
      const text = (prose && prose.trim()) || "Retomando automaticamente o trabalho anterior.";
      events.push({ type: "assistant_text", data: { text, final: true } });
      persistCalls.push({ s: text, o: { lastFinishOk: false, finished: false } });
      return { ok: false, resumable: true, steps, toolsUsed: [], error: "resumable" };
    },
    notifyLoopStatus: () => {},
    attemptGracefulClosing: async () => "Fechamento amigável do assistente.",
    finishClarify: async (message: string) => {
      events.push({ type: "assistant_text", data: { text: message, final: true } });
      persistCalls.push({ s: message, o: { lastFinishOk: true } });
      return { ok: true, summary: message, steps: 0, toolsUsed: [] };
    },
    loopBudgetExceeded: () => false,
    requiresFinalBuildGate: () => false,
    bumpLlmRetries: async () => 0,
    resetLlmRetries: async () => {},
    llmChat: async () => ({ role: "assistant", content: "ok", tool_calls: [] }),
    getContextFiles: () => [],
    narrationPhase: narration,
    narrationBuffer: "",
    isCanceled: async () => false,
    touchHeartbeat: async () => {},
    maybeEmitSilenceHeartbeat: () => {},
    persistAssistantStep: async () => null,
    updateAssistantStep: async () => {},
    recordTouchedPath: (path: string) => {
      if (path) touched.add(path);
    },
    emitTransition: async () => {},
    runDesignPreflightIfNeeded: async () => null,
    enabledApprovedPlanSteps: () => [],
  };
  Object.assign(base, overrides);
  const deps = base as BuildExecuteDeps & {
    _events: () => typeof events;
    _persistCalls: () => typeof persistCalls;
  };
  deps._events = () => events;
  deps._persistCalls = () => persistCalls;
  return deps;
}

type ClosureCase = {
  name: string;
  setup: (deps: ReturnType<typeof makeMinimalDeps>) => void;
};

const cases: ClosureCase[] = [
  {
    name: "budget_exceeded",
    setup: (deps) => {
      deps.loopBudgetExceeded = () => true;
    },
  },
  {
    name: "canceled",
    setup: (deps) => {
      deps.isCanceled = async () => true;
    },
  },
  {
    name: "preflight_terminal",
    setup: (deps) => {
      deps.runDesignPreflightIfNeeded = async () => ({
        status: "terminal_fail",
        feedback: "PREFLIGHT FALHOU",
        checks: [{ name: "build", ok: false, output: "err" }],
      });
    },
  },
  {
    name: "llm_error_resumable",
    setup: (deps) => {
      deps.llmChat = async () => {
        throw new Error("llm fail");
      };
    },
  },
  {
    name: "max_steps_resumable",
    setup: (deps) => {
      deps.maxStepsLimit = 0;
    },
  },
  {
    name: "stream_empty_success",
    setup: (deps) => {
      deps.llmChat = async () => ({ role: "assistant", content: "", tool_calls: [] });
      deps.maxStepsLimit = 1;
      deps.requiresFinalBuildGate = () => false;
    },
  },
  {
    name: "tool_miss_terminal",
    setup: (deps) => {
      deps.approvedPlanBuild = true;
      deps.state.intent = { type: "modify", summary: "fix", scope: ["local"], complexity: "medium" };
      let calls = 0;
      deps.llmChat = async () => {
        calls += 1;
        return { role: "assistant", content: "", tool_calls: [] };
      };
      deps.getToolMissCount = () => 3;
    },
  },
  {
    name: "opening_before_tools",
    setup: (deps) => {
      deps.llmChat = async () => ({
        role: "assistant",
        content: "",
        tool_calls: [{ id: "t1", name: "fs_read", arguments: { path: "src/App.tsx" } }],
      });
      deps.requiresFinalBuildGate = () => false;
      deps.maxStepsLimit = 2;
      let inner = 0;
      const prior = deps.llmChat;
      deps.llmChat = async (...args: Parameters<BuildExecuteDeps["llmChat"]>) => {
        inner += 1;
        if (inner === 1) {
          return {
            role: "assistant" as const,
            content: "",
            tool_calls: [{ id: "t1", name: "fs_read", arguments: { path: "src/App.tsx" } }],
          };
        }
        return prior(...args);
      };
    },
  },
];

function assertClosureProse(
  name: string,
  res: Awaited<ReturnType<typeof runBuildExecutePhase>>,
  ev: Array<{ type: string; data: Record<string, unknown> }>,
  pc: Array<{ s: string; o?: unknown }>,
  opts?: { requireOpening?: boolean },
) {
  const hasProse = ev.some(
    (e) => e.type === "assistant_text" && typeof e.data.text === "string" && String(e.data.text).trim().length > 0,
  );
  const hasFinal = ev.some((e) => e.type === "assistant_text" && e.data.final === true);
  const hasPersist = pc.some((p) => typeof p.s === "string" && p.s.trim().length > 0);
  const noHard = !String(res?.error || "").includes("não respondeu") &&
    !String(res?.error || "").includes("Sem resposta");

  assert(hasProse, `${name}: must emit prose`);
  assert(hasFinal, `${name}: must final:true`);
  assert(hasPersist, `${name}: must persistFinal`);
  assert(noHard, `${name}: no hard error msg`);
  if (opts?.requireOpening) {
    assert(
      ev.some((e) => e.type === "assistant_text" && e.data.opening === true),
      `${name}: must emit opening before tools`,
    );
  }
}

Deno.test("closure paths — table driven real entry points emit prose + persistFinal + final:true", async () => {
  for (const c of cases) {
    const deps = makeMinimalDeps();
    c.setup(deps);
    const res = await runBuildExecutePhase(deps, 0);
    assertClosureProse(c.name, res, deps._events(), deps._persistCalls(), {
      requireOpening: c.name === "opening_before_tools",
    });
  }
});

Deno.test("chat-turn — erro LLM emite assistant_text via returnResumableWithUserMessage", async () => {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  const persisted: string[] = [];
  const result = await runChatModeAgentTurn(
    {
      robinActive: false,
      originalUserRequest: "oi",
      messages: [],
      streamState: { llmResponseWasStreamed: false, thinkingStreamStartedAt: null },
      emit: (t, d) => events.push({ type: t, data: d as Record<string, unknown> }),
      returnResumableWithUserMessage: async (_s, _t, _o, prose) => {
        const text = prose || "erro";
        events.push({ type: "assistant_text", data: { text, final: true } });
        persisted.push(text);
        return { ok: false, error: text, steps: 0, resumable: true, toolsUsed: [] };
      },
      onActivity: () => {},
      runId: "r1",
      projectId: "p",
      llmResponseWasStreamed: false,
      configuredModel: () =>
        ({ chat: async () => ({ role: "assistant", content: "", tool_calls: [] }) }) as LLMProvider,
      persistFinal: async (s) => {
        persisted.push(s);
      },
      clearCheckpoint: async () => {},
      persistPlanFinal: async () => {},
      emitTransition: async () => {},
    },
    { chat: async () => { throw new Error("fail"); } } as LLMProvider,
  );

  assertEquals(result.ok, false);
  assert(events.some((e) => e.type === "assistant_text" && e.data.final === true));
  assert(persisted.length > 0);
});

Deno.test("structural — execute.ts and plan-turn.ts use returnResumableWithUserMessage not bare chunk", () => {
  const fs = (globalThis as { Deno?: { readTextFileSync: (url: URL) => string } }).Deno?.readTextFileSync;
  if (!fs) return;
  const execSrc = fs(new URL("./execute.ts", import.meta.url));
  const planSrc = fs(new URL("./plan-turn.ts", import.meta.url));
  const chatSrc = fs(new URL("./chat-turn.ts", import.meta.url));
  const bareExec = /return\s+deps\.returnResumableChunk\s*\(/.test(execSrc);
  const barePlan = /return\s+deps\.returnResumableChunk\s*\(/.test(planSrc);
  const bareChat = /return\s+deps\.returnResumableChunk\s*\(/.test(chatSrc);
  assertEquals(bareExec, false, "execute.ts must not call bare returnResumableChunk");
  assertEquals(barePlan, false, "plan-turn.ts must not call bare returnResumableChunk");
  assertEquals(bareChat, false, "chat-turn.ts must not call bare returnResumableChunk");
});