import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ChatParams, ChatResponse, LLMProvider } from "./types.ts";
import { llmChatLine } from "./narration.ts";

class MockLLM implements LLMProvider {
  constructor(private content: string) {}
  async chat(_p: ChatParams): Promise<ChatResponse> {
    return { role: "assistant", content: this.content, tool_calls: [] };
  }
}

Deno.test("llmChatLine — rejeita resposta curta demais", async () => {
  const text = await llmChatLine(new MockLLM("ok"), "sys", "user", { minLength: 12 });
  assertEquals(text, null);
});

Deno.test("llmChatLine — aceita resposta longa o suficiente", async () => {
  const text = await llmChatLine(
    new MockLLM("Beleza — vou montar a landing com hero e cardápio."),
    "sys",
    "user",
    { minLength: 12 },
  );
  assertEquals(text, "Beleza — vou montar a landing com hero e cardápio.");
});