import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildForgeAgentSystemInput } from "./agent-system-input.ts";
import { VIBE_PLAN_TAIL } from "./vibe-coding-prompt.ts";

Deno.test("buildForgeAgentSystemInput plan mode exige create_plan no system", () => {
  const system = buildForgeAgentSystemInput({
    planMode: true,
    projectTemplate: "vite-react",
  });
  assert(system.includes("create_plan` é **obrigatório**"));
  assert(system.includes("ERRADO: `## Princípio"));
  assert(system.includes(VIBE_PLAN_TAIL));
});

Deno.test("buildForgeAgentSystemInput vite-react inclui design manifest", () => {
  const system = buildForgeAgentSystemInput({
    planMode: false,
    projectTemplate: "vite-react",
  });
  assert(system.includes("HeroCinematicSpotlight"));
  assert(system.includes("PROIBIDO importar"));
  assertEquals(system.includes("ProcessSteps"), true);
  assertEquals(system.match(/HeroSignature, BentoGrid/) !== null, false);
});