import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deriveClassificationFromPrompt, ModelRouter } from "./router.ts";
import type { LLMProvider } from "./types.ts";
import type { ChatParams, ChatResponse } from "./types.ts";

class MockLLM implements LLMProvider {
  async chat(_p: ChatParams): Promise<ChatResponse> {
    return { content: "ok", toolCalls: null };
  }
}

Deno.test("ModelRouter — expõe main provider (agente único)", () => {
  const main = new MockLLM();
  const r = new ModelRouter(
    undefined,
    { main },
    { provider: "openai", apiKey: "sk-mock", model: "gpt-test", label: "mock" },
  );
  assertEquals(r.getMainProvider(), main);
  assertEquals(r.selectModel(), main);
  assertEquals(r.mainCfg.label, "mock");
});

Deno.test("deriveClassificationFromPrompt — heurística por tamanho e modo", () => {
  const short = deriveClassificationFromPrompt("site", false);
  assertEquals(short.complexity, 2);
  assertEquals(short.needsBuild, true);

  const plan = deriveClassificationFromPrompt("landing de padaria com hero e cardápio", true);
  assertEquals(plan.needsBuild, false);
  assertEquals(plan.type, "modify");

  const big = deriveClassificationFromPrompt(
    "Crie uma landing completa de padaria artesanal com hero, cardápio interativo, reservas e integração WhatsApp",
    false,
  );
  assertEquals(big.type, "new_project");
  assertEquals(big.complexity >= 3, true);
});