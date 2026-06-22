import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyAutoModelForComplexity } from "./loop-auto-model.ts";
import { ModelRouter } from "../router.ts";

Deno.test("applyAutoModelForComplexity — no-op for modo fixed", () => {
  const router = new ModelRouter(
    { GROQ_API_KEY: "gsk-test" },
    undefined,
    {
      provider: "groq",
      apiKey: "gsk-test",
      model: "llama-3.3-70b-versatile",
      label: "test",
    },
  );
  const before = router.mainCfg.model;
  applyAutoModelForComplexity({
    preferences: { mode: "fixed", fixedPresetId: "pool-groq-flash" },
    connectorKeys: { GROQ_API_KEY: "gsk-test" },
    complexity: 5,
    llm: { chat: async () => ({ content: "" }) },
    router,
  });
  assertEquals(router.mainCfg.model, before);
});