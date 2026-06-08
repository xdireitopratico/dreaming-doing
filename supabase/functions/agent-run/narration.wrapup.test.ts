import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildFinalWrapUp } from "./narration.ts";

Deno.test("buildFinalWrapUp resume parcial com arquivos", () => {
  const text = buildFinalWrapUp({
    stepsCompleted: 3,
    totalSteps: 10,
    touchedPaths: ["src/App.tsx", "src/Hero.tsx"],
    toolsUsed: ["fs_write", "fs_edit"],
    resumable: true,
    partial: true,
  });
  assertEquals(text.includes("Entrega parcial"), true);
  assertEquals(text.includes("src/App.tsx"), true);
  assertEquals(text.includes("Continuar"), true);
  assertEquals(text.includes("3/10"), true);
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