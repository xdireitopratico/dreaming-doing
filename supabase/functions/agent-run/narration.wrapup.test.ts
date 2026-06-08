import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildFinalWrapUp } from "./narration.ts";

Deno.test("buildFinalWrapUp resume silencioso com arquivos", () => {
  const text = buildFinalWrapUp({
    stepsCompleted: 3,
    totalSteps: 10,
    touchedPaths: ["src/App.tsx", "src/Hero.tsx"],
    toolsUsed: ["fs_write", "fs_edit"],
    silentResume: true,
  });
  assertEquals(text.includes("Ainda estou trabalhando"), true);
  assertEquals(text.includes("src/App.tsx"), true);
  assertEquals(text.includes("Continuar"), false);
});

Deno.test("buildFinalWrapUp parcial visível sem Continuar", () => {
  const text = buildFinalWrapUp({
    stepsCompleted: 3,
    totalSteps: 10,
    touchedPaths: ["src/App.tsx"],
    toolsUsed: ["fs_write"],
    partial: true,
  });
  assertEquals(text.includes("Até aqui"), true);
  assertEquals(text.includes("Continuar"), false);
});

Deno.test("buildFinalWrapUp sucesso com preview hint", () => {
  const text = buildFinalWrapUp({
    stepsCompleted: 5,
    totalSteps: 8,
    touchedPaths: ["src/App.tsx"],
    toolsUsed: ["fs_write"],
    resumable: false,
  });
  assertEquals(text.includes("Pronto!"), true);
  assertEquals(text.includes("preview"), true);
});