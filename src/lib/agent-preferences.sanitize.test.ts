import { describe, expect, it } from "vitest";
import {
  isSmokePoisonedUserModelEntry,
  sanitizeSmokePoisonedPreferences,
} from "@/lib/agent-preferences";

describe("isSmokePoisonedUserModelEntry", () => {
  it("detecta label E2E", () => {
    expect(
      isSmokePoisonedUserModelEntry({
        slug: "cohere/north-mini-code:free",
        env: "openrouter",
        label: "E2E OpenRouter free",
      }),
    ).toBe(true);
  });

  it("ignora entrada legítima", () => {
    expect(
      isSmokePoisonedUserModelEntry({
        slug: "anthropic/claude-sonnet-4",
        env: "openrouter",
        label: "Claude Sonnet",
      }),
    ).toBe(false);
  });
});

describe("sanitizeSmokePoisonedPreferences", () => {
  it("remove entrada E2E e legacy useCustomModel", () => {
    const { prefs, changed } = sanitizeSmokePoisonedPreferences({
      mode: "fixed",
      useCustomModel: true,
      customModelId: "cohere/north-mini-code:free",
      fixedPresetId: "google--gemma-4-31b-it",
      userModelEntries: [
        {
          slug: "cohere/north-mini-code:free",
          env: "openrouter",
          label: "E2E OpenRouter free",
        },
      ],
    });
    expect(changed).toBe(true);
    expect(prefs.userModelEntries).toBeUndefined();
    expect(prefs.useCustomModel).toBeUndefined();
    expect(prefs.customModelId).toBeUndefined();
    expect(prefs.fixedPresetId).toBe("google--gemma-4-31b-it");
  });

  it("reseta para auto quando fixed só tinha poison E2E", () => {
    const { prefs, changed } = sanitizeSmokePoisonedPreferences({
      mode: "fixed",
      useCustomModel: true,
      customModelId: "cohere/north-mini-code:free",
      userModelEntries: [
        {
          slug: "cohere/north-mini-code:free",
          env: "openrouter",
          label: "E2E OpenRouter free",
        },
      ],
    });
    expect(changed).toBe(true);
    expect(prefs.mode).toBe("auto");
    expect(prefs.userModelEntries).toBeUndefined();
    expect(prefs.useCustomModel).toBeUndefined();
  });

  it("não altera prefs limpas", () => {
    const clean = { mode: "auto" as const, autoAllowedPresetIds: ["pool-groq-flash"] };
    const { prefs, changed } = sanitizeSmokePoisonedPreferences(clean);
    expect(changed).toBe(false);
    expect(prefs).toEqual(clean);
  });
});