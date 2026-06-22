import { describe, expect, it } from "vitest";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";

describe("isAgentPreferencesConfigured", () => {
  it("aceita fixed com customModelId (E2E OpenRouter)", () => {
    expect(
      isAgentPreferencesConfigured({
        mode: "fixed",
        useCustomModel: true,
        customModelId: "nex-agi/nex-n2-pro:free",
      }),
    ).toBe(true);
  });

  it("aceita fixed com userModelEntries", () => {
    expect(
      isAgentPreferencesConfigured({
        mode: "fixed",
        userModelEntries: [{ slug: "nex-agi/nex-n2-pro:free", env: "openrouter" }],
      }),
    ).toBe(true);
  });
});