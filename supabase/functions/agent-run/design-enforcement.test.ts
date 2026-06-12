import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { scanFileForViolations } from "./design-enforcement.ts";

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

Deno.test("scanProjectForLandingQuality — exige ≥3 composites quaisquer, não lista fixa", async () => {
  const { scanProjectForLandingQuality } = await import("./design-enforcement.ts");
  const files = new Map([
    [
      "src/App.tsx",
      `import { HeroSignature, ServiceGrid, TestimonialCarousel, FadeIn } from "@forge/ui";
export default function App() {
  return (
    <main>
      <HeroSignature title="Oficina" primaryCta={{ label: "Agendar" }} />
      <ServiceGrid items={[]} />
      <TestimonialCarousel items={[]} />
      <FadeIn><p>ok</p></FadeIn>
    </main>
  );
}`,
    ],
  ]);
  assertEquals(scanProjectForLandingQuality(files).length, 0);
});
