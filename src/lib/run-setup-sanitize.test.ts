import { describe, expect, it } from "vitest";
import { sanitizeRuntimePreferences } from "../../supabase/functions/agent-run/run-setup.ts";

describe("sanitizeRuntimePreferences", () => {
  it("remove allowlist e campos de outros modos do runtime fixed", () => {
    const prefs = sanitizeRuntimePreferences({
      mode: "fixed",
      fixedPresetId: "google--gemma-4-31b-it",
      autoAllowedPresetIds: ["google--gemini-3-1-pro"],
      robinPoolModelId: "openrouter/gpt-4.1",
      poolProvider: "openrouter",
    });

    expect(prefs?.fixedPresetId).toBe("google--gemma-4-31b-it");
    expect(prefs?.autoAllowedPresetIds).toBeUndefined();
    expect(prefs?.robinPoolModelId).toBeUndefined();
    expect(prefs?.poolProvider).toBeUndefined();
  });

  it("remove campos fixed/robin do runtime auto", () => {
    const prefs = sanitizeRuntimePreferences({
      mode: "auto",
      fixedPresetId: "google--gemma-4-31b-it",
      autoAllowedPresetIds: ["google--gemini-3-1-pro"],
      robinPoolModelId: "openrouter/gpt-4.1",
      poolProvider: "openrouter",
      useCustomModel: true,
      customModelId: "openrouter/deepseek-r1",
    });

    expect(prefs?.autoAllowedPresetIds).toEqual(["google--gemini-3-1-pro"]);
    expect(prefs?.fixedPresetId).toBeUndefined();
    expect(prefs?.robinPoolModelId).toBeUndefined();
    expect(prefs?.poolProvider).toBeUndefined();
    expect(prefs?.useCustomModel).toBeUndefined();
    expect(prefs?.customModelId).toBeUndefined();
  });
});
