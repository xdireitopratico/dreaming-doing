import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ChatParams, ChatResponse, LLMProvider } from "./types.ts";
import { generateClosureMessage } from "./narration.ts";

class MockLLM implements LLMProvider {
  constructor(private content: string) {}
  async chat(_p: ChatParams): Promise<ChatResponse> {
    return { role: "assistant", content: this.content, tool_calls: [] };
  }
}

Deno.test("generateClosureMessage — resume silencioso com arquivos", async () => {
  const resolved = await generateClosureMessage(
    new MockLLM("Ainda estou trabalhando — já deixei parte do pedido pronta."),
    {
      touchedPaths: ["src/App.tsx", "src/Hero.tsx"],
      silentResume: true,
      userRequest: "landing",
    },
  );
  assertStringIncludes(resolved.extraText!, "trabalhando");
});

Deno.test("generateClosureMessage — entrega via LLM com contexto", async () => {
  const prior = "Alterei o App.tsx — confere o preview.";
  const resolved = await generateClosureMessage(
    new MockLLM("Ficou no App.tsx — abre o preview e me diz se quer ajuste."),
    {
      touchedPaths: ["src/App.tsx"],
      priorConversation: prior,
      userRequest: "ajuste no app",
    },
  );
  assertStringIncludes(resolved.extraText!, "preview");
  assertEquals(resolved.emitExtra, true);
});