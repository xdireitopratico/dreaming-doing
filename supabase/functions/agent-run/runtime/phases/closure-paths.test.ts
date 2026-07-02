// closure-paths.test.ts — Table-driven AC1 coverage for all exit kinds (no test theater).

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runBuildExecutePhase, type BuildExecuteDeps } from "./execute.ts";
import type { ChatMessage } from "../../types.ts";
import { NarrationPhase } from "./narration.ts";
import { createCanonicalBuildSession } from "../build-session.ts";

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
    getBuildToolPhase: () => "discovery" as const,
    setBuildToolPhase: () => {},
    getReadGateBlockCount: () => 0,
    setReadGateBlockCount: () => {},
    getForceWriteAttempted: () => false,
    setForceWriteAttempted: () => {},
    getLlmResponseWasStreamed: () => false,
    getLastExecutePhaseMessage: () => null,
    setLastExecutePhaseMessage: () => {},
    getBuildSession: () => createCanonicalBuildSession("r1", false),
    setBuildSession: () => {},
    touchedPaths: touched,
    executionModel: { chat: async () => ({ role: "assistant", content: "", tool_calls: [] }) },
    reg: { getDefinitions: () => [] },
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
    observer: { notify: () => {} },
    router: { mainCfg: { model: "x" } },
    emitAgentProse: () => {},
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
    attemptGracefulClosing: async () => null,
    finishClarify: async () => ({ ok: false }),
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
    recordTouchedPath: () => {},
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

const cases = [
  { name: "budget", exit: "budget" },
  { name: "llm_error_resumable", exit: "llm_error" },
  { name: "max_steps", exit: "max" },
  { name: "stream_empty", exit: "empty_response" },
] as const;

Deno.test("closure paths — table driven real entry points emit prose + persistFinal + final:true + no error", async () => {
  for (const c of cases) {
    const deps = makeMinimalDeps();
    if (c.exit === "budget") deps.loopBudgetExceeded = () => true;
    if (c.exit === "llm_error") {
      deps.llmChat = async () => {
        throw new Error("llm fail");
      };
    }
    if (c.exit === "max") deps.maxStepsLimit = 0;
    if (c.exit === "empty_response") {
      deps.llmChat = async () => ({ role: "assistant", content: "", tool_calls: [] });
      deps.maxStepsLimit = 1;
    }

    const res = await runBuildExecutePhase(deps, 0);
    const ev = deps._events();
    const pc = deps._persistCalls();
    const hasProse = ev.some(
      (e) => e.type === "assistant_text" && typeof e.data.text === "string" && String(e.data.text).trim().length > 0,
    );
    const hasFinal = ev.some((e) => e.type === "assistant_text" && e.data.final === true);
    const hasPersist = pc.some((p) => typeof p.s === "string" && p.s.trim().length > 0);
    const noHard = !String(res?.error || "").includes("não respondeu") &&
      !String(res?.error || "").includes("Sem resposta");

    assert(hasProse, `${c.name}: must emit prose`);
    assert(hasFinal, `${c.name}: must final:true`);
    assert(hasPersist, `${c.name}: must persistFinal`);
    assert(noHard, `${c.name}: no hard error msg`);
  }
});

Deno.test("structural — execute.ts and plan-turn.ts use returnResumableWithUserMessage not bare chunk", () => {
  const fs = (globalThis as { Deno?: { readTextFileSync: (url: URL) => string } }).Deno?.readTextFileSync;
  if (!fs) return;
  const execSrc = fs(new URL("./execute.ts", import.meta.url));
  const planSrc = fs(new URL("./plan-turn.ts", import.meta.url));
  const bareExec = /return\s+deps\.returnResumableChunk\s*\(/.test(execSrc);
  const barePlan = /return\s+deps\.returnResumableChunk\s*\(/.test(planSrc);
  assertEquals(bareExec, false, "execute.ts must not call bare returnResumableChunk");
  assertEquals(barePlan, false, "plan-turn.ts must not call bare returnResumableChunk");
});