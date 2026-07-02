import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DIRECT_CHAT_SYSTEM } from "../../conversational.ts";
import { createChatModeTokenHandler } from "./plan-turn.ts";
import { runChatModeAgentTurn } from "./chat-turn.ts";
import type { ChatTurnDeps } from "./chat-turn.ts";
import type { PauseReason } from "../infra.ts";
import type { LLMProvider } from "../../types.ts";

Deno.test("DIRECT_CHAT_SYSTEM exportado para chat-turn", () => {
  assertEquals(typeof DIRECT_CHAT_SYSTEM, "string");
  assertEquals(DIRECT_CHAT_SYSTEM.includes("FORGE"), true);
});

Deno.test("createChatModeTokenHandler emite assistant_text visível (sem thinking)", () => {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  const streamState = { llmResponseWasStreamed: false, thinkingStreamStartedAt: null };
  const handler = createChatModeTokenHandler(
    streamState,
    (type, data) => {
      events.push({ type, data: data as Record<string, unknown> });
    },
    () => {},
  );

  handler("Olá");
  assertEquals(events.length, 1);
  assertEquals(events[0].type, "assistant_text");
  assertEquals(events[0].data.text, "Olá");
  assertEquals(events[0].data.thinking, undefined);
  assertEquals(streamState.llmResponseWasStreamed, true);
});

Deno.test("runChatModeAgentTurn — resposta vazia pausa aguardando usuário", async () => {
  const deps = mockChatTurnDeps();
  const model = {
    chat: async () => ({ content: "" }),
  } as unknown as LLMProvider;

  const result = await runChatModeAgentTurn(deps, model);

  assertEquals(result.ok, false);
  assertEquals(result.awaiting, true);
  assertEquals(result.resumable, false);
  assertEquals(result.error, "Resposta vazia do modelo.");
  assertEquals(deps.pauseOperationCalls, 1);
});

function mockChatTurnDeps(): ChatTurnDeps & {
  pauseOperationCalls: number;
} {
  let pauseOperationCalls = 0;
  return {
    runId: "run-1",
    projectId: "proj-1",
    llmResponseWasStreamed: false,
    emit: () => {},
    configuredModel: () => {
      throw new Error("not used");
    },
    persistFinal: async () => {},
    persistPlanFinal: async () => {},
    clearCheckpoint: async () => {},
    emitTransition: async () => {},
    robinActive: false,
    originalUserRequest: "oi",
    messages: [{ role: "user", content: "oi" }],
    streamState: { llmResponseWasStreamed: false, thinkingStreamStartedAt: null },
    get pauseOperationCalls() {
      return pauseOperationCalls;
    },
    pauseOperationForUser: async (input: {
      reason: PauseReason;
      message: string;
      steps: number;
      toolsUsed: Set<string>;
    }) => {
      pauseOperationCalls += 1;
      return {
        ok: false,
        error: input.message,
        steps: input.steps,
        resumable: false,
        awaiting: true,
        awaitingUser: { type: input.reason, message: input.message },
        toolsUsed: [...input.toolsUsed],
      };
    },
    onActivity: () => {},
  } as unknown as ChatTurnDeps & { pauseOperationCalls: number };
}
