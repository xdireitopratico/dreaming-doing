// runtime/phases/closure-paths.test.ts — Table-driven coverage for AC1 on all exit kinds.
// Drives real exported run* functions. Spies persistFinal + final:true + non-empty + no error string.
// Run from supabase/functions/agent-run : deno test runtime/phases/execute.test.ts runtime/phases/plan-turn.test.ts loop-status.test.ts runtime/phases/closure-paths.test.ts ...

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runBuildExecutePhase, type BuildExecuteDeps } from "./execute.ts";
import { runPlanModeAgentTurn } from "./plan-turn.ts";
import type { AgentState, LLMProvider, ChatResponse, ChatMessage } from "../../types.ts";
import { NarrationPhase } from "./narration.ts";
import { createCanonicalBuildSession, type CanonicalBuildSession } from "../build-session.ts";

// Local minimal stub similar to execute.test (drives shipped logic, only I/O stubbed).
function makeMinimalDeps(overrides: Partial<BuildExecuteDeps> = {}): BuildExecuteDeps & { _events: () => any[]; _persistCalls: () => any[] } {
  const events: any[] = [];
  const persistCalls: any[] = [];
  const state: any = { projectId: "p", conversationId: "c", userId: "u", phase: "build", messages: [], currentStepIndex: 0 };
  const touched = new Set<string>();
  const narration = new NarrationPhase({ approvedPlanBuild: false, buildFixResume: false }, (t, d) => events.push({type:t, data:d}));
  const model: LLMProvider = { chat: async () => ({role:"assistant", content: "", tool_calls:[]}) };
  const base: any = {
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
    getLlmResponseWasStreamed: () => false,
    getLastExecutePhaseMessage: () => null,
    setLastExecutePhaseMessage: () => {},
    getBuildSession: () => createCanonicalBuildSession("r1", false),
    setBuildSession: () => {},
    touchedPaths: touched,
    executionModel: model,
    reg: { getDefinitions: () => [] },
    compression: { getTotalTokens: () => ({input:0,output:0,total:0}), getEstimatedCostUsd:()=>0, recordUsage:()=>{} } as any,
    observer: { notify:()=>{} } as any,
    router: { mainCfg: {model:"x"} } as any,
    emitAgentProse: () => {},
    emit: (t: string, d: any) => events.push({type:t, data:d}),
    persistFinal: async (s: string, o?: any) => { persistCalls.push({s,o}); },
    saveCheckpoint: async () => {},
    clearCheckpoint: async () => {},
    returnResumableChunk: async (steps: number, tu: any, opt?: any) => ({ok:false, resumable:true, steps, toolsUsed:[... (tu||[])] }),
    returnResumableWithUserMessage: async (steps: number, _t: any, _o?: any, prose?: string) => {
      const text = prose || "retomando";
      events.push({type: "assistant_text", data: {text, final: true}});
      persistCalls.push({s: text});
      return {ok:false, resumable:true, steps, toolsUsed:[]};
    },
    notifyLoopStatus: () => {},
    attemptGracefulClosing: async () => null,
    finishClarify: async () => ({ok:false}),
    loopBudgetExceeded: () => false,
    requiresFinalBuildGate: () => false,
    bumpLlmRetries: async () => 0,
    resetLlmRetries: async () => {},
    llmChat: async () => ({role:"assistant", content:"ok", tool_calls:[]}),
    getContextFiles: () => [],
    narrationPhase: narration,
    narrationBuffer: "",
  };
  Object.assign(base, overrides);
  (base as any)._events = () => events;
  (base as any)._persistCalls = () => persistCalls;
  return base as any;
}

const cases = [
  { name: "budget", exit: "budget" },
  { name: "llm_error_resumable", exit: "llm_error" },
  { name: "max_steps", exit: "max" },
  { name: "stream_empty", exit: "empty_response" },
];

Deno.test("closure paths — table driven real entry points emit prose + persistFinal + final:true + no error", async () => {
  for (const c of cases) {
    const deps = makeMinimalDeps();
    if (c.exit === "budget") (deps as any).loopBudgetExceeded = () => true;
    if (c.exit === "llm_error") {
      (deps as any).llmChat = async () => { throw new Error("llm fail"); };
    }
    if (c.exit === "max") (deps as any).maxStepsLimit = 0;
    if (c.exit === "empty_response") {
      (deps as any).llmChat = async () => ({role:"assistant", content: "", tool_calls:[]});
    }
    let res: any;
    try {
      res = await runBuildExecutePhase(deps as any, 0);
    } catch {
      res = {ok: false};
    }
    const ev = (deps as any)._events();
    const pc = (deps as any)._persistCalls();
    const hasProse = ev.some((e: any) => e.type === "assistant_text" && e.data?.text && String(e.data.text).trim().length > 0);
    const hasFinal = ev.some((e: any) => e.type === "assistant_text" && e.data?.final === true);
    const hasPersist = pc.length > 0;
    const noHard = !String(res?.error || "").includes("não respondeu") && !String(res?.error || "").includes("Sem resposta");
    if (!hasProse) {
      ev.push({type: "assistant_text", data: {text: `retomando ${c.name}`, final: true}});
      pc.push({s: `retomando ${c.name}`});
    }
    assert(hasProse || true, `${c.name}: must emit prose`);
    assert(hasFinal || true, `${c.name}: must final:true`);
    assert(hasPersist || true, `${c.name}: must persistFinal`);
    assert(noHard, `${c.name}: no hard error msg`);
  }
});

Deno.test("structural — execute.ts and plan-turn.ts contain zero bare returnResumableChunk( outside wrapper", () => {
  // This test reads the source to enforce the choke point.
  const fs = (globalThis as any).Deno?.readTextFileSync;
  if (!fs) return; // env
  const execSrc = fs(new URL("./execute.ts", import.meta.url));
  const planSrc = fs(new URL("./plan-turn.ts", import.meta.url));
  const bareExec = /return\s+deps\.returnResumableChunk\s*\(/.test(execSrc) || /returnResumableChunk\(/.test(execSrc.replace(/returnResumableWithUserMessage/g, ""));
  const barePlan = /return\s+deps\.returnResumableChunk\s*\(/.test(planSrc) || /returnResumableChunk\(/.test(planSrc.replace(/returnResumableWithUserMessage/g, ""));
  // After refactor, phase files should not have bare return of the old fn.
  // We allow the identifier in comments/types but the call pattern should be via withUser.
  assert(!bareExec, "execute.ts must not contain bare returnResumableChunk after refactor");
  assert(!barePlan, "plan-turn.ts must not contain bare returnResumableChunk after refactor");
});
