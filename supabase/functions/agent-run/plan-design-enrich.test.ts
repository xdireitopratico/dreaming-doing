import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enrichProposedPlanDesign } from "./plan-design-enrich.ts";
import type { ProposedPlan } from "./types.ts";

function basePlan(): ProposedPlan {
  return {
    planId: "p1",
    summary: "Landing de padaria artesanal",
    steps: [
      { id: "s1", type: "custom", description: "Hero e cardápio", enabled: true },
      { id: "s2", type: "custom", description: "Contato e localização", enabled: true },
    ],
    ttlMs: 60_000,
  };
}

Deno.test("enrichProposedPlanDesign — preenche design em plano UI sem campo", () => {
  const enriched = enrichProposedPlanDesign(basePlan(), "padaria artesanal", "vite-react");
  assert(enriched.design?.voice?.length);
  assert(enriched.design?.moment?.trim());
  assert((enriched.design?.read_paths?.length ?? 0) >= 2);
  assert((enriched.design?.compositions?.length ?? 0) >= 1);
});

Deno.test("enrichProposedPlanDesign — não sobrescreve design existente", () => {
  const plan = {
    ...basePlan(),
    design: {
      voice: ["brutalist"],
      moment: "Tipo gigante",
      techniques: ["kinetic-typography"],
    },
  };
  const enriched = enrichProposedPlanDesign(plan, "studio", "vite-react");
  assertEquals(enriched.design?.voice, ["brutalist"]);
});

Deno.test("enrichProposedPlanDesign — ignora templates sem UI", () => {
  const enriched = enrichProposedPlanDesign(basePlan(), "api only", "android-native");
  assertEquals(enriched.design, undefined);
});