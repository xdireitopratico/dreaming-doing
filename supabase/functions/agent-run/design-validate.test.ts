import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadDesignManifest } from "./design-manifest.ts";
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

Deno.test("validateDesignImplementation — 15 composições opinionated (manifest)", () => {
  const manifest = loadDesignManifest();
  const comps = manifest.compositions_opinionated as { id: string; export: string }[];
  assertEquals(comps.length, 15);

  for (const comp of comps) {
    const files = new Map([
      [
        "src/App.tsx",
        `import { ${comp.export} } from "@forge/ui";
export default () => <main><${comp.export} title="Craft" primaryCta={{ label: "Go" }} /></main>;`,
      ],
    ]);
    const r = validateDesignImplementation({
      expected: {
        compositions: [comp.id],
        composition_exports: [comp.export],
        techniques: [],
      },
      files,
    });
    assertEquals(r.pass, true, `composition ${comp.id} (${comp.export})`);
  }
});

Deno.test("validateDesignImplementation — 21 técnicas (manifest signatures)", () => {
  const manifest = loadDesignManifest();
  const techSigs = manifest.technique_signatures as { id: string; patterns: string[] }[];
  assertEquals(techSigs.length, 21);

  for (const tech of techSigs) {
    const token = tech.patterns[0] ?? tech.id;
    const files = new Map([
      [
        "src/App.tsx",
        `import { HeroCinematicSpotlight } from "@forge/ui";
// technique: ${tech.id}
export default () => <main><HeroCinematicSpotlight title="x" primaryCta={{label:"Go"}} />{/* ${token} */}</main>;`,
      ],
    ]);
    const r = validateDesignImplementation({
      expected: {
        compositions: ["hero-cinematic-spotlight"],
        composition_exports: ["HeroCinematicSpotlight"],
        techniques: [tech.id],
      },
      files,
    });
    assertEquals(r.pass, true, `technique ${tech.id} (token ${token})`);
  }
});