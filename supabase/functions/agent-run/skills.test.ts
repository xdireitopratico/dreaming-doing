import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SkillRegistry } from "./skills.ts";
import type { FileEntry } from "./types.ts";

const FORGE_UI_SEED: FileEntry[] = [
  {
    id: "1",
    path: "package.json",
    content: '{"dependencies":{"@forge/ui":"file:./packages/forge-ui"}}',
    updated_at: "",
  },
  {
    id: "2",
    path: "src/index.css",
    content: "@theme { --color-brand-500: #000; }",
    updated_at: "",
  },
];

Deno.test("forge-design skill — sem default HeroSignature+BentoGrid no prompt", () => {
  const reg = new SkillRegistry();
  const active = reg.detectActive(FORGE_UI_SEED);
  const forge = active.find((s) => s.name === "forge-design");
  assert(forge, "forge-design deve ativar com tailwind/forge-ui seed");
  assertEquals(forge.systemPrompt.includes("HeroSignature, BentoGrid"), false);
  assertEquals(forge.systemPrompt.includes("HeroCinematicSpotlight"), true);
});

Deno.test("resolveDisplayNames — alias forge-design → design-system", () => {
  const reg = new SkillRegistry();
  assertEquals(reg.resolveDisplayNames(["forge-design", "react-tailwind"]), [
    "design-system",
    "react-tailwind",
  ]);
});