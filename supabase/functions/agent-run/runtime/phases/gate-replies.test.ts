import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  appendResumeInstruction,
  buildApprovedClassification,
  resolveUserPrompt,
  runShowExistingPlanGate,
} from "./gate-replies.ts";
import type { GateReplyDeps } from "./gate-replies.ts";
import type { AgentState, ChatMessage } from "../../types.ts";
import { LoopPhase } from "../../types.ts";

Deno.test("appendResumeInstruction — adiciona nudge quando último não é user", () => {
  const messages: ChatMessage[] = [{ role: "assistant", content: "ok" }];
  appendResumeInstruction(messages);
  assertEquals(messages.length, 2);
  assertEquals(messages[1].role, "user");
  const content = messages[1].content;
  const text = typeof content === "string" ? content : "";
  assertEquals(text.includes("[Retomar]"), true);
});

Deno.test("appendResumeInstruction — não duplica se último já é user", () => {
  const messages: ChatMessage[] = [{ role: "user", content: "continue" }];
  appendResumeInstruction(messages);
  assertEquals(messages.length, 1);
});

Deno.test("resolveUserPrompt — prioriza originalUserRequest", () => {
  const messages: ChatMessage[] = [{ role: "user", content: "do histórico" }];
  assertEquals(resolveUserPrompt(messages, "  pedido original  "), "pedido original");
});

Deno.test("resolveUserPrompt — fallback para última mensagem user", () => {
  const messages: ChatMessage[] = [
    { role: "assistant", content: "x" },
    { role: "user", content: "  última pergunta  " },
  ];
  assertEquals(resolveUserPrompt(messages, ""), "última pergunta");
});

Deno.test("buildApprovedClassification — defaults e summary", () => {
  const result = buildApprovedClassification(0, "Construir landing");
  assertEquals(result.complexity, 3);
  assertEquals(result.type, "modify");
  assertEquals(result.needsBuild, true);
  assertEquals(result.summary, "Construir landing");
});

Deno.test("runShowExistingPlanGate — null quando não é pedido de plano", async () => {
  const deps = mockGateDeps({ originalUserRequest: "crie uma landing" });
  const result = await runShowExistingPlanGate(deps, async () => {
    throw new Error("should not call");
  });
  assertEquals(result, null);
});

function mockGateDeps(overrides?: Partial<GateReplyDeps>): GateReplyDeps & {
  events: Array<{ type: string; data: unknown }>;
  persisted: string[];
} {
  const events: Array<{ type: string; data: unknown }> = [];
  const persisted: string[] = [];
  return {
    state: {
      projectId: "proj-1",
      conversationId: "conv-1",
      userId: "user-1",
      messages: [],
      phase: LoopPhase.GATHER_CONTEXT,
      currentStepIndex: 0,
      executionLog: [],
      context: null,
      intent: null,
      plan: null,
      validationResults: [],
      retryFeedback: null,
      totalSteps: 0,
    } as AgentState,
    context: null,
    originalUserRequest: "",
    planMode: false,
    emit: (type, data) => events.push({ type, data }),
    configuredModel: () => {
      throw new Error("not used");
    },
    persistFinal: async (summary) => {
      persisted.push(summary);
    },
    clearCheckpoint: async () => {},
    events,
    persisted,
    ...overrides,
  };
}