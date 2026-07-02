import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeAgentPreferences } from "./agent-preferences-db.ts";

Deno.test("normalizeAgentPreferences preserva contextWindow do usuário", () => {
  const prefs = normalizeAgentPreferences({
    mode: "fixed",
    fixedPresetId: "openai/gpt-5",
    contextWindow: {
      mode: "auto",
      windowTokens: 1_000_000,
    },
  });

  assertEquals(prefs?.mode, "fixed");
  assertEquals(prefs?.contextWindow, {
    mode: "auto",
    windowTokens: 1_000_000,
  });
});

Deno.test("normalizeAgentPreferences não inventa windowTokens quando contexto está ausente", () => {
  const prefs = normalizeAgentPreferences({
    mode: "auto",
  });

  assertEquals(prefs?.mode, "auto");
  assertEquals(prefs?.contextWindow, undefined);
});
