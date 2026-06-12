import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildClosureMessage } from "./narration.ts";

Deno.test("buildClosureMessage — resume silencioso com arquivos", () => {
  const text = buildClosureMessage({
    touchedPaths: ["src/App.tsx", "src/Hero.tsx"],
    silentResume: true,
  }).text;
  assertEquals(text.includes("Ainda estou trabalhando"), true);
});

Deno.test("buildClosureMessage — entrega já mencionada no chat", () => {
  const prior = "Alterei o App.tsx — confere o preview.";
  const resolved = buildClosureMessage({
    touchedPaths: ["src/App.tsx"],
    priorConversation: prior,
  });
  assertEquals(resolved.text, prior);
  assertEquals(resolved.emitExtra, false);
});