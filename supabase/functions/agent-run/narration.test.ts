import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildApprovedPlanBriefing,
  buildClassifyBriefing,
  buildGatherNarration,
  buildObserveNarration,
  buildToolBatchNarration,
} from "./narration.ts";

Deno.test("buildClassifyBriefing — build com passos", () => {
  const text = buildClassifyBriefing(
    {
      complexity: 3,
      type: "new_project",
      summary: "Landing de cafeteria com hero e menu",
      needsBuild: true,
      needsDeps: false,
      plan: {
        rationale: "x",
        steps: [
          { id: "s1", type: "create_file", description: "Criar Hero.tsx", enabled: true },
          { id: "s2", type: "edit_file", description: "Ligar no App.tsx", enabled: true },
        ],
      },
    },
    { maxSteps: 20, planMode: false },
  );
  assertStringIncludes(text, "criar algo novo");
  assertStringIncludes(text, "Landing de cafeteria");
  assertStringIncludes(text, "Criar Hero.tsx");
  assertStringIncludes(text, "20 passos");
});

Deno.test("buildGatherNarration — arquivos-chave", () => {
  const text = buildGatherNarration(12, ["package.json", "src/App.tsx"]);
  assertStringIncludes(text, "package.json");
  assertStringIncludes(text, "12 arquivos");
});

Deno.test("buildApprovedPlanBriefing — passos", () => {
  const text = buildApprovedPlanBriefing("Landing café", [
    { id: "s1", type: "custom", description: "Hero com CTA", enabled: true },
  ]);
  assertStringIncludes(text, "plano aprovado");
  assertStringIncludes(text, "Hero com CTA");
});

Deno.test("buildToolBatchNarration — lote de tools", () => {
  const text = buildToolBatchNarration(
    [
      { name: "fs_read", arguments: { path: "src/App.tsx" } },
      { name: "fs_write", arguments: { path: "src/Hero.tsx" } },
    ],
    { step: 1, total: 5, allOk: true },
  );
  assertEquals(text?.includes("Passo 1/5"), true);
  assertStringIncludes(text!, "src/App.tsx");
  assertStringIncludes(text!, "src/Hero.tsx");
});

Deno.test("buildObserveNarration — variantes", () => {
  assertStringIncludes(buildObserveNarration("build"), "compila");
  assertStringIncludes(buildObserveNarration("validate_ok"), "Build OK");
});