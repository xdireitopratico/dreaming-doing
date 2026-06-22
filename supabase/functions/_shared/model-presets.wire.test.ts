import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveModelFromPreferences,
  resolveWireFromPresetId,
  wireWithKey,
} from "./model-presets.ts";

const XAI_KEYS = {
  XAI_API_KEY: "xai-test-key",
  OPENAI_API_KEY: "sk-inception-should-not-use",
};

Deno.test("resolveWireFromPresetId — custom xai usa XAI_API_KEY e api.x.ai", () => {
  const userModels = [
    { slug: "xai/grok-4-1-fast-non-reasoning", env: "xai", label: "Grok 4.1 Fast" },
  ];
  const wire = resolveWireFromPresetId("custom--xai--grok-4-1-fast-non-reasoning", userModels);
  assertEquals(wire?.secretKey, "XAI_API_KEY");
  assertEquals(wire?.baseUrl, "https://api.x.ai/v1");
  assertEquals(wire?.model, "grok-4-1-fast-non-reasoning");
});

Deno.test("resolveModelFromPreferences — fixed xai não usa OPENAI_API_KEY", () => {
  const resolved = resolveModelFromPreferences(
    {
      fixedPresetId: "custom--xai--grok-4-1-fast-non-reasoning",
      userModelEntries: [
        { slug: "xai/grok-4-1-fast-non-reasoning", env: "xai", label: "Grok 4.1 Fast" },
      ],
    },
    XAI_KEYS,
  );
  assertEquals(resolved?.apiKey, "xai-test-key");
  assertEquals(resolved?.baseUrl, "https://api.x.ai/v1");
  assertEquals(resolved?.secretKey, "XAI_API_KEY");
});

Deno.test("wireFromUserEntry — custom-inception usa chave dedicada", () => {
  const wire = resolveWireFromPresetId("custom--custom-inception--mercury-2", [
    { slug: "custom-inception/mercury-2", env: "custom-inception", label: "Mercury 2" },
  ]);
  assertEquals(wire?.secretKey, "CUSTOM_INCEPTION_API_KEY");
});

Deno.test("wireWithKey — custom provider resolve baseUrl do connector", () => {
  const wire = {
    provider: "openai",
    model: "mercury-2",
    label: "Mercury 2",
    secretKey: "CUSTOM_INCEPTION_API_KEY",
  };
  const resolved = wireWithKey(wire, {
    CUSTOM_INCEPTION_API_KEY: "sk-inception",
    CUSTOM_INCEPTION_BASE_URL: "https://api.inceptionlabs.ai/v1",
  });
  assertEquals(resolved?.apiKey, "sk-inception");
  assertEquals(resolved?.baseUrl, "https://api.inceptionlabs.ai/v1");
});