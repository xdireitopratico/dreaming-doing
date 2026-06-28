import { describe, expect, it } from "vitest";
import { resolveStudioSelectedEnv } from "@/lib/model-catalog";

describe("resolveStudioSelectedEnv", () => {
  it("modo auto usa env do primeiro modelo do pool", () => {
    expect(
      resolveStudioSelectedEnv({
        mode: "auto",
        autoAllowedPresetIds: ["google--gemma-4-31b-it"],
      }),
    ).toBe("gemini");
  });

  it("modo auto sem pool não adivinha provider conectado", () => {
    expect(
      resolveStudioSelectedEnv(
        { mode: "auto", autoAllowedPresetIds: [] },
      ),
    ).toBe("groq");
  });

  it("modo fixed sem preset não usa provider conectado como fallback", () => {
    expect(
      resolveStudioSelectedEnv({ mode: "fixed" }),
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
