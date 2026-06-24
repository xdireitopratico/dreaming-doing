import { describe, expect, it } from "vitest";
import { resolveStudioSelectedEnv } from "@/lib/model-catalog";

describe("resolveStudioSelectedEnv", () => {
  it("modo auto usa env do primeiro modelo permitido (não OpenRouter)", () => {
    expect(
      resolveStudioSelectedEnv({
        mode: "auto",
        autoAllowedPresetIds: ["google--gemma-4-31b-it"],
      }),
    ).toBe("gemini");
  });

  it("modo fixed sem preset cai no primeiro provider conectado (exceto openrouter)", () => {
    expect(
      resolveStudioSelectedEnv(
        { mode: "fixed" },
        { groq: true, openrouter: true },
      ),
    ).toBe("groq");
  });

  it("modo robin usa poolProvider", () => {
    expect(
      resolveStudioSelectedEnv({
        mode: "robin",
        poolProvider: "nvidia",
        robinPoolModelId: "pool-nemotron-super",
      }),
    ).toBe("nvidia");
  });
});