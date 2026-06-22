import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyOpenAiConnectorToken } from "../_shared/provider-wire.ts";

const BUILT_IN: Array<{ id: string; key: string }> = [
  { id: "xai", key: "XAI_API_KEY" },
  { id: "groq", key: "GROQ_API_KEY" },
  { id: "openai", key: "OPENAI_API_KEY" },
  { id: "nvidia", key: "NVIDIA_API_KEY" },
  { id: "gemini", key: "GEMINI_API_KEY" },
  { id: "openrouter", key: "OPENROUTER_API_KEY" },
];

for (const { id, key } of BUILT_IN) {
  Deno.test(`applyOpenAiConnectorToken — ${id} → ${key}`, () => {
    const out = applyOpenAiConnectorToken(id, `token-${id}`, {});
    assertEquals(out[key], `token-${id}`);
  });
}

Deno.test("applyOpenAiConnectorToken — custom-inception isolado", () => {
  const out = applyOpenAiConnectorToken("custom-inception", "sk-inception", {
    baseUrl: "https://api.inceptionlabs.ai/v1",
  });
  assertEquals(out.CUSTOM_INCEPTION_API_KEY, "sk-inception");
  assertEquals(out.CUSTOM_INCEPTION_BASE_URL, "https://api.inceptionlabs.ai/v1");
});

Deno.test("applyOpenAiConnectorToken — xai + openai coexistem", () => {
  const keys = {
    ...applyOpenAiConnectorToken("xai", "xai-key", {}),
    ...applyOpenAiConnectorToken("openai", "openai-key", {}),
  };
  assertEquals(keys.XAI_API_KEY, "xai-key");
  assertEquals(keys.OPENAI_API_KEY, "openai-key");
});