import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateDesignFidelity, formatFidelityFeedback } from "./design-fidelity.ts";
import type { DesignPlanField } from "./types.ts";

const MOCK_HIGH_QUALITY_CODE = `import { HeroCinematicSpotlight, BentoDenseShowcase, GlassNavFloating, FadeIn, SpotlightCursor } from "@forge/ui";
import { MeshGradient } from "@forge/ui/components";

export default function Page() {
  return (
    <main className="grid-cols-12 gap-4">
      <GlassNavFloating logo="MyBrand" links={[{ href: "/", label: "Home" }]} />
      <HeroCinematicSpotlight
        title="Studio"
        subtitle="Design excepcional"
        primaryCta={{ label: "Começar" }}
        meshColors={["#0ea5e9", "#0284c7"]}
        spotlightRadius={400}
      />
      <BentoDenseShowcase
        highlightCard={{ title: "Destaque" }}
        cards={[{ title: "Card 1" }, { title: "Card 2" }]}
        spotlightEnabled
      />
      <section className="py-24 max-w-5xl mx-auto space-y-12">
        <FadeIn><h2 className="text-4xl font-bold tracking-tight">Features</h2></FadeIn>
        <div className="grid grid-cols-3 gap-8">
          <div className="bg-surface-1 rounded-xl p-6">Feature 1</div>
          <div className="bg-surface-1 rounded-xl p-6">Feature 2</div>
          <div className="bg-surface-1 rounded-xl p-6">Feature 3</div>
        </div>
      </section>
      <SpotlightCursor radius={300} color="rgba(14,165,233,0.1)" />
    </main>
  );
}
`;

const MOCK_GENERIC_CODE = `import { HeroSignature, BentoGrid } from "@forge/ui";

export default function App() {
  return (
    <main>
      <HeroSignature title="SaaS" primaryCta={{ label: "Go" }} />
      <BentoGrid cells={[]} />
    </main>
  );
}
`;

const APPROVED_HIGH_DESIGN: DesignPlanField = {
  voice: ["high-tech", "swiss"],
  mood: "ocean",
  techniques: ["spotlight-cursor", "animated-mesh-background", "scroll-reveal"],
  moment: "Hero cinematic com spotlight cursor + mesh gradient + grid swiss — adaptado para studio criativo",
  compositions: ["hero-cinematic-spotlight", "bento-dense-showcase", "glass-nav-floating"],
  composition_exports: ["HeroCinematicSpotlight", "BentoDenseShowcase", "GlassNavFloating"],
  relevant_dnas: ["linear-motion-choreography"],
  read_paths: ["packages/forge-ui/src/compositions/opinionated/HeroCinematicSpotlight.tsx"],
  anti_patterns: ["hero centralizado com 3 cards simétricos"],
  synthesis_reasoning: "High-tech + Swiss: precisão técnica com acabamento digital impecável",
};

const APPROVED_GENERIC_DESIGN: DesignPlanField = {
  voice: ["swiss"],
  mood: "mono",
  techniques: ["scroll-reveal"],
  moment: "Hero tipográfico com grid — adaptado para produto digital",
  compositions: ["hero-editorial-split", "faq-accordion-craft"],
  composition_exports: ["HeroEditorialSplit", "FAQAccordionCraft"],
  read_paths: [],
  anti_patterns: [],
  synthesis_reasoning: "Fallback",
};

Deno.test("validateDesignFidelity — design rico e fiel passa com score alto", () => {
  const files = new Map([["src/App.tsx", MOCK_HIGH_QUALITY_CODE]]);
  const result = validateDesignFidelity(APPROVED_HIGH_DESIGN, files);
  assertEquals(result.pass, true, `Deveria passar: score ${(result.score * 100).toFixed(0)}%`);
  assert(result.score >= 0.6, `Score ${(result.score * 100).toFixed(0)}% abaixo do threshold`);
});

Deno.test("validateDesignFidelity — código genérico falha com score baixo", () => {
  const files = new Map([["src/App.tsx", MOCK_GENERIC_CODE]]);
  const result = validateDesignFidelity(APPROVED_HIGH_DESIGN, files);
  assertEquals(result.pass, false, "Design genérico deve falhar na verificação de fidelidade");
  assert(result.score < 0.6, `Score ${(result.score * 100).toFixed(0)}% deveria ser < 60%`);
  assert(result.blocking_issues.length > 0, "Deveria ter issues bloqueantes");
});

Deno.test("validateDesignFidelity — sem approvedDesign retorna score 0", () => {
  const files = new Map([["src/App.tsx", ""]]);
  const result = validateDesignFidelity(
    { voice: [], techniques: [], moment: "", mood: undefined },
    files,
  );
  assertEquals(result.pass, false);
});

Deno.test("validateDesignFidelity — verifica todas as dimensões", () => {
  const files = new Map([["src/App.tsx", MOCK_HIGH_QUALITY_CODE]]);
  const result = validateDesignFidelity(APPROVED_HIGH_DESIGN, files);
  const dimensions = result.checks.map((c) => c.dimension);
  assert(dimensions.includes("voice"), "Deveria verificar voice");
  assert(dimensions.includes("mood"), "Deveria verificar mood");
  assert(dimensions.includes("technique"), "Deveria verificar techniques");
  assert(dimensions.includes("complexity"), "Deveria verificar complexity");
  assert(dimensions.includes("moment"), "Deveria verificar moment");
});

Deno.test("validateDesignFidelity — threshold mais baixo é mais leniente", () => {
  const files = new Map([["src/App.tsx", MOCK_GENERIC_CODE]]);
  const low = validateDesignFidelity(APPROVED_HIGH_DESIGN, files, 0.1);
  const high = validateDesignFidelity(APPROVED_HIGH_DESIGN, files, 0.9);
  // Ambos falham porque blocking_issues existem (score < 0.4 em dimensions)
  // Mas o score computado com threshold baixo pode passar enquanto high não
  assertEquals(low.score >= high.score, true, "Threshold baixo não deveria reduzir score");
  assert(typeof low.score === "number" && typeof high.score === "number");
});

Deno.test("formatFidelityFeedback — resultado pass produz feedback positivo", () => {
  const result = validateDesignFidelity(
    APPROVED_HIGH_DESIGN,
    new Map([["src/App.tsx", MOCK_HIGH_QUALITY_CODE]]),
  );
  const feedback = formatFidelityFeedback(result);
  assert(feedback.includes("OK"), `Feedback deveria indicar sucesso: ${feedback.slice(0, 100)}`);
});

Deno.test("formatFidelityFeedback — resultado fail produz feedback acionável", () => {
  const result = validateDesignFidelity(
    APPROVED_HIGH_DESIGN,
    new Map([["src/App.tsx", MOCK_GENERIC_CODE]]),
  );
  const feedback = formatFidelityFeedback(result);
  // Tom curatorial: não diz "FALHOU" — indica abaixo do mínimo + ação concreta.
  assert(!feedback.includes("COESÃO DE DESIGN OK"), `Feedback não deveria ser de sucesso: ${feedback.slice(0, 100)}`);
  assert(feedback.includes("fs_edit"), `Feedback deveria ser acionável (fs_edit): ${feedback.slice(0, 120)}`);
  assert(result.pass === false, "Resultado deveria ser falha");
});

Deno.test("validateDesignFidelity — detecta técnicas ausentes", () => {
  const files = new Map([["src/App.tsx", `export default () => <div>hello</div>`]]);
  const result = validateDesignFidelity(APPROVED_HIGH_DESIGN, files);
  const techCheck = result.checks.find((c) => c.dimension === "technique");
  assert(techCheck, "Deveria ter check de technique");
  assert(techCheck!.score === 0, "Score de technique deveria ser 0 sem técnicas implementadas");
  assert(techCheck!.evidence.missing.length > 0, "Deveria listar técnicas ausentes");
});

Deno.test("validateDesignFidelity — lista blocking issues corretamente", () => {
  const files = new Map([["src/App.tsx", MOCK_GENERIC_CODE]]);
  const result = validateDesignFidelity(APPROVED_HIGH_DESIGN, files);
  assert(result.blocking_issues.length > 0);
  for (const issue of result.blocking_issues) {
    assert(typeof issue === "string" && issue.length > 0);
  }
});

Deno.test("validateDesignFidelity — substituição criativa NÃO é bloqueada (premissa)", () => {
  // Página com ofício (várias seções + técnicas detectadas) e gesto realizado, mas que OMITE
  // a técnica prescrita (scroll-reveal) substituindo por outras (marquee, parallax, count-up).
  // No gate antigo (conformidade) isto falhava; no gate invertido (ofício) deve PASSAR.
  const files = new Map([
    [
      "src/App.tsx",
      `import { HeroEditorialSplit, FAQAccordionCraft, Marquee, CountUp } from "@forge/ui";

export default function Page() {
  return (
    <main aria-label="Hero tipográfico grid — produto digital adaptado">
      <HeroEditorialSplit headline="Studio" />
      <section className="features"><Marquee items={["alpha","bravo"]} /></section>
      <section className="narrative process"><h2 className="parallax">Como funciona</h2><CountUp to={120} /></section>
      <FAQAccordionCraft items={[]} />
      <section className="cta">Comece agora</section>
      <footer>Rodapé</footer>
    </main>
  );
}`,
    ],
  ]);
  const result = validateDesignFidelity(APPROVED_GENERIC_DESIGN, files);
  assertEquals(result.pass, true, `Substituição criativa deveria passar: ${JSON.stringify(result.blocking_issues)}`);
  assert(
    !result.blocking_issues.some((i) => i.includes("technique")),
    "Omitir técnica prescrita não deve bloquear",
  );
  const techCheck = result.checks.find((c) => c.dimension === "technique");
  assert(techCheck?.score === 0, "Técnica prescrita (scroll-reveal) foi de fato omitida");
  const momentCheck = result.checks.find((c) => c.dimension === "moment");
  assert((momentCheck?.score ?? 0) >= 0.5, "Gesto deve ser considerado realizado pela forma");
});

Deno.test("validateDesignFidelity — página rasa (sem ofício) É bloqueada (premissa)", () => {
  // Mesmo "seguindo" a técnica prescrita, uma página sem profundidade é mediana → bloqueia.
  const files = new Map([
    ["src/App.tsx", `import { Reveal } from "@forge/ui";\nexport default function App() { return <Reveal><h1>Olá</h1></Reveal>; }`],
  ]);
  const result = validateDesignFidelity(APPROVED_GENERIC_DESIGN, files);
  assertEquals(result.pass, false, "Página rasa deve falhar — mediano é inaceitável");
  assert(result.blocking_issues.length > 0, "Deveria ter issue de ofício (complexity)");
});
