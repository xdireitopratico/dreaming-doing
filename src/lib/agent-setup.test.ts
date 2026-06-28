import { describe, expect, it } from "vitest";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";

describe("isAgentPreferencesConfigured", () => {
  it("auto só configura quando há pool explícito", () => {
    expect(
      isAgentPreferencesConfigured({
        mode: "auto",
        autoAllowedPresetIds: [],
      }),
    ).toBe(false);
    expect(
      isAgentPreferencesConfigured({
        mode: "auto",
        autoAllowedPresetIds: ["google--gemini-3-1-pro"],
      }),
    ).toBe(true);
  });

  it("fixo só configura com preset explícito", () => {
    expect(
      isAgentPreferencesConfigured({
        mode: "fixed",
        fixedPresetId: "google--gemma-4-31b-it",
      }),
    ).toBe(true);
    expect(isAgentPreferencesConfigured({ mode: "fixed" })).toBe(false);
  });
});
