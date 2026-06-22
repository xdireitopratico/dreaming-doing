import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createAgentRuntime } from "./agent-runtime.ts";
import { LoopPhase } from "../types.ts";
import { ToolRegistry } from "../registry.ts";

Deno.test("AgentRuntime — run com heartbeat start/stop", async () => {
  const reg = new ToolRegistry();
  const llm = {
    chat: async () => ({
      content: "ok",
      tool_calls: [],
    }),
  };
  const state = {
    projectId: "p1",
    conversationId: "c1",
    userId: "u1",
    messages: [{ role: "user" as const, content: "oi" }],
    phase: LoopPhase.GATHER_CONTEXT,
    currentStepIndex: 0,
    context: null,
    intent: null,
    plan: null,
    validationResults: [],
    executionLog: [],
    retryFeedback: null,
    totalSteps: 5,
  };
  const sb = {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [] }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ data: null }),
      }),
      insert: () => Promise.resolve({ data: { id: "m1" } }),
    }),
  };

  const runtime = createAgentRuntime({
    reg,
    llm,
    supabase: sb,
    state,
    injectedKeys: { GROQ_API_KEY: "gsk-test" },
    options: {
      maxSteps: 2,
      runId: "run-rt",
      resolvedMainCfg: {
        provider: "groq",
        apiKey: "gsk-test",
        model: "llama-3.3-70b-versatile",
        label: "test",
      },
    },
  });

  const loop = runtime.getLoop();
  assertEquals(typeof loop.startHeartbeatTimer, "function");
  assertEquals(typeof loop.stopHeartbeatTimer, "function");
});