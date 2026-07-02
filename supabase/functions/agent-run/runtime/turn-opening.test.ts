import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { attemptOpeningProse } from "./turn-opening.ts";

Deno.test("attemptOpeningProse — retorna prosa sanitizada do LLM", async () => {
  const text = await attemptOpeningProse({
    messages: [{ role: "user", content: "crie landing" }],
    userRequest: "crie landing",
    model: {
      chat: async () => ({
        role: "assistant" as const,
        content: "  Vou montar a landing agora.  ",
        tool_calls: [],
      }),
    },
  });
  assertEquals(text, "Vou montar a landing agora.");
});

Deno.test("attemptOpeningProse — vazio quando LLM falha", async () => {
  const text = await attemptOpeningProse({
    messages: [],
    userRequest: "x",
    model: {
      chat: async () => {
        throw new Error("fail");
      },
    },
  });
  assertEquals(text, null);
});