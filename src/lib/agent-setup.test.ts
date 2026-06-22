import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  store.set("forge:agent-preferences", "{}");
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  });
  vi.stubGlobal("window", { localStorage: localStorage });
});

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