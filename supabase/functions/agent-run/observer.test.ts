import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { RuntimeObserver } from "./observer.ts";
import { ToolRegistry } from "./registry.ts";
import type { DesignPlanField } from "./types.ts";

const PKG = JSON.stringify({
  dependencies: { "@forge/ui": "file:./packages/forge-ui" },
});

const GENERIC_APP = `import { HeroSignature, BentoGrid, StatsRibbon, FadeIn } from "@forge/ui";
export default () => (
  <main>
    <HeroSignature title="S" primaryCta={{ label: "Go" }} />
    <BentoGrid cells={[]} />
    <StatsRibbon stats={[]} />
    <FadeIn/>
  </main>
);`;

const CRAFT_APP = `import { HeroCinematicSpotlight, FeatureMatrix, TestimonialCarousel, Reveal, Parallax } from "@forge/ui";
export default () => (
  <main>
    <HeroCinematicSpotlight title="Studio" primaryCta={{ label: "Go" }} />
    <FeatureMatrix items={[]} />
    <TestimonialCarousel items={[]} />
    <Reveal><Parallax>ok</Parallax></Reveal>
  </main>
);`;

const approvedDesign: DesignPlanField = {
  voice: ["high-tech"],
  moment: "Cinematic hero com parallax",
  techniques: ["parallax-depth"],
  compositions: ["hero-cinematic-spotlight"],
  composition_exports: ["HeroCinematicSpotlight"],
};

function makeObserver(code: string, design?: DesignPlanField): RuntimeObserver {
  const reg = new ToolRegistry();
  const cache = new Map([
    ["package.json", PKG],
    ["src/index.css", "@theme { --color-brand-500: oklch(0.5 0.2 30); }"],
    ["src/App.tsx", code],
  ]);
  const observer = new RuntimeObserver(reg, cache);
  if (design) observer.setApprovedDesign(design);
  return observer;
}

Deno.test("checkDesignSystem — bloqueia craft incompleto com approvedDesign (G37)", async () => {
  const result = await makeObserver(GENERIC_APP, approvedDesign).checkDesignSystem();
  assertEquals(result.ok, false);
  assert(
    result.output.includes("Craft incompleto") ||
      result.output.includes("HeroCinematicSpotlight") ||
      result.output.includes("parallax"),
  );
});

Deno.test("checkDesignSystem — passa com assinaturas do brief aprovado", async () => {
  const result = await makeObserver(CRAFT_APP, approvedDesign).checkDesignSystem();
  assertEquals(result.ok, true);
});

Deno.test("setApprovedDesign — sem design não bloqueia por design-validate (G38)", async () => {
  const result = await makeObserver(GENERIC_APP).checkDesignSystem();
  assertEquals(result.output.includes("Craft incompleto"), false);
});