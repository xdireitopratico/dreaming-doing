import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveFinalChatMessage } from "./narration.ts";

Deno.test("resolveFinalChatMessage — conversa pura sem template", () => {
  const answer =
    "Nesta plataforma o **Expo** costuma rodar melhor — você testa no preview com QR. Quer que eu suba o scaffold?";
  const resolved = resolveFinalChatMessage({
    stepsCompleted: 1,
    totalSteps: 8,
    touchedPaths: [],
    toolsUsed: [],
    narration: answer,
  });
  assertEquals(resolved.text, answer);
  assertEquals(resolved.emitExtra, false);
  assertEquals(resolved.text.includes("Pronto!"), false);
  assertEquals(resolved.text.includes("Nenhum arquivo"), false);
});

Deno.test("resolveFinalChatMessage — resume silencioso com arquivos", () => {
  const text = resolveFinalChatMessage({
    stepsCompleted: 3,
    totalSteps: 10,
    touchedPaths: ["src/App.tsx", "src/Hero.tsx"],
    toolsUsed: ["fs_write", "fs_edit"],
    silentResume: true,
  }).text;
  assertEquals(text.includes("Ainda estou trabalhando"), true);
  assertEquals(text.includes("Continuar"), false);
});

Deno.test("resolveFinalChatMessage — entrega com arquivos", () => {
  const resolved = resolveFinalChatMessage({
    stepsCompleted: 5,
    totalSteps: 8,
    touchedPaths: ["src/App.tsx"],
    toolsUsed: ["fs_write"],
    narration: "Montei o hero e liguei no App.",
  });
  assertEquals(resolved.emitExtra, true);
  assertEquals(resolved.text.includes("preview"), true);
  assertEquals(resolved.text.includes("Pronto!"), false);
  assertEquals(resolved.text.includes("Resumo do que fiz"), false);
});

Deno.test("resolveFinalChatMessage — entrega já mencionada no chat", () => {
  const narration = "Alterei o App.tsx — confere o preview.";
  const resolved = resolveFinalChatMessage({
    stepsCompleted: 2,
    totalSteps: 8,
    touchedPaths: ["src/App.tsx"],
    toolsUsed: ["fs_edit"],
    narration,
  });
  assertEquals(resolved.text, narration);
  assertEquals(resolved.emitExtra, false);
});
