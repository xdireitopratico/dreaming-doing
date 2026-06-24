import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  countManifestImports,
  scanFileForViolations,
  scanProjectForLandingQuality,
} from "./design-enforcement.ts";

Deno.test("scanFileForViolations — rejeita import profundo @forge/ui/components/Motion", () => {
  const code = `import { FadeIn } from "@forge/ui/components/Motion";\nexport function App() { return null; }`;
  const violations = scanFileForViolations("src/App.tsx", code);
  assertEquals(
    violations.some((v) => v.message.includes("@forge/ui/components/Motion")),
    true,
  );
});

Deno.test("scanFileForViolations — aceita import canônico @forge/ui", () => {
  const code = `import { FadeIn, HeroSignature } from "@forge/ui";\nexport function App() { return <HeroSignature title="x" primaryCta={{ label: "Go" }} />; }`;
  const violations = scanFileForViolations("src/App.tsx", code);
  assertEquals(
    violations.some((v) => v.message.includes("components/Motion")),
    false,
  );
});

Deno.test("scanFileForViolations — rejeita composite phantom ServiceGrid", () => {
  const code = `import { HeroSignature, ServiceGrid } from "@forge/ui";\nexport default () => <ServiceGrid items={[]} />;`;
  const violations = scanFileForViolations("src/App.tsx", code);
  assertEquals(
    violations.some((v) => v.message.includes("ServiceGrid")),
    true,
  );
});

Deno.test("countManifestImports — conta só exports reais do import", () => {
  const code = `import { HeroCinematicSpotlight, FeatureMatrix, StatsRibbon } from "@forge/ui";`;
  assertEquals(countManifestImports(code), 3);
});

Deno.test("scanProjectForLandingQuality — HeroCinematicSpotlight passa", async () => {
  const files = new Map([
    [
      "src/App.tsx",
      `import { HeroCinematicSpotlight, FeatureMatrix, TestimonialCarousel, Reveal } from "@forge/ui";
export default function App() {
  return (
    <main>
      <HeroCinematicSpotlight title="Studio" primaryCta={{ label: "Go" }} />
      <FeatureMatrix items={[]} />
      <TestimonialCarousel items={[]} />
      <Reveal><p>ok</p></Reveal>
    </main>
  );
}`,
    ],
  ]);
  assertEquals(scanProjectForLandingQuality(files).length, 0);
});

Deno.test("scanProjectForLandingQuality — HeroSignature+BentoGrid genérico falha", async () => {
  const files = new Map([
    [
      "src/App.tsx",
      `import { HeroSignature, BentoGrid, StatsRibbon, FadeIn } from "@forge/ui";
export default function App() {
  return (
    <main>
      <HeroSignature title="SaaS" primaryCta={{ label: "Go" }} />
      <BentoGrid cells={[]} />
      <StatsRibbon stats={[]} />
      <FadeIn><p>ok</p></FadeIn>
    </main>
  );
}`,
    ],
  ]);
  const violations = scanProjectForLandingQuality(files);
  assertEquals(
    violations.some((v) => v.message.includes("HeroSignature+BentoGrid")),
    true,
  );
});