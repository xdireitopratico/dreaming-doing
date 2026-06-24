import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DIRECT_CHAT_SYSTEM } from "../../conversational.ts";
import { createChatModeTokenHandler } from "./plan-turn.ts";

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