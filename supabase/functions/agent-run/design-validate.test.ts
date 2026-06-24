import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateDesignImplementation } from "./design-validate.ts";

Deno.test("validateDesignImplementation — detecta parallax", () => {
  const files = new Map([
    [
      "src/App.tsx",
      `import { HeroCinematicSpotlight, Parallax } from "@forge/ui";
export default () => <main><HeroCinematicSpotlight title="x" primaryCta={{label:"Go"}} /><Parallax>ok</Parallax></main>;`,
    ],
  ]);
  const r = validateDesignImplementation({
    expected: {
      compositions: ["hero-cinematic-spotlight"],
      composition_exports: ["HeroCinematicSpotlight"],
      techniques: ["parallax-depth"],
    },
    files,
  });
  assertEquals(r.pass, true);
});

Deno.test("validateDesignImplementation — falha Hero+Bento genérico", () => {
  const files = new Map([
    [
      "src/App.tsx",
      `import { HeroSignature, BentoGrid, FadeIn } from "@forge/ui";
export default () => <main><HeroSignature title="x" primaryCta={{label:"Go"}} /><BentoGrid cells={[]} /><FadeIn/></main>;`,
    ],
  ]);
  const r = validateDesignImplementation({
    expected: { compositions: [], composition_exports: [], techniques: [] },
    files,
  });
  assert(!r.pass);
});