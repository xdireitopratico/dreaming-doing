import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DIRECT_CHAT_SYSTEM } from "../../conversational.ts";
import { createChatModeTokenHandler } from "./plan-turn.ts";
import { runChatModeAgentTurn } from "./chat-turn.ts";
import type { ChatTurnDeps } from "./chat-turn.ts";
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

Deno.test("runChatModeAgentTurn — resposta vazia retorna chunk resumível", async () => {
  const deps = mockChatTurnDeps();
  const model = {
    chat: async () => ({ content: "" }),
  } as unknown as LLMProvider;

  const result = await runChatModeAgentTurn(deps, model);

  assertEquals(result.ok, false);
  assertEquals(result.resumable, true);
  assertEquals(result.summary, "Resposta vazia do modelo.");
  assertEquals(deps.returnResumableCalls, 1);
});

function mockChatTurnDeps(): ChatTurnDeps & {
  returnResumableCalls: number;
} {
  let returnResumableCalls = 0;
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
    get returnResumableCalls() {
      return returnResumableCalls;
    },
    returnResumableWithUserMessage: async (_steps: number, _toolsUsed: Set<string>, _opt?: unknown, prose?: string) => {
      returnResumableCalls += 1;
      return {
        ok: false,
        error: "Retomando automaticamente em novo chunk…",
        steps: 0,
        resumable: true,
        toolsUsed: [],
        summary: prose,
      };
    },
    onActivity: () => {},
  } as unknown as ChatTurnDeps & { returnResumableCalls: number };
}
