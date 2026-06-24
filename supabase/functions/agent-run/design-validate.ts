// design-validate.ts — Valida assinaturas de craft no código gerado.
import type { DesignResolvePackage } from "./design-resolve.ts";

export type ValidateResult = {
  pass: boolean;
  missing: string[];
  feedback: string;
};

const TECHNIQUE_SIGNATURES: Record<string, RegExp[]> = {
  "parallax-depth": [/Parallax|useScrollProgress|parallax/i],
  "animated-mesh-background": [/mesh|@keyframes|AnimatedMesh/i],
  "grain-texture-overlay": [/GrainArtisanalOverlay|mix-blend-mode:\s*overlay|grain/i],
  "sticky-stack": [/StickyStackNarrative|position:\s*sticky/i],
  "scroll-reveal": [/Reveal|StaggerContainer|FadeIn/i],
  "kinetic-typography": [/KineticHeadlineReveal|TextShimmer|kinetic/i],
  "spotlight-cursor": [/Spotlight|spotlight/i],
};

const COMPOSITION_SIGNATURES: Record<string, RegExp> = {
  "hero-cinematic-spotlight": /HeroCinematicSpotlight/,
  "hero-editorial-split": /HeroEditorialSplit/,
  "hero-brutalist-typography": /HeroBrutalistTypography/,
  "sticky-stack-narrative": /StickyStackNarrative/,
  "bento-dense-showcase": /BentoDenseShowcase/,
  "kinetic-headline-reveal": /KineticHeadlineReveal/,
};

export function validateDesignImplementation(input: {
  expected: Pick<DesignResolvePackage, "compositions" | "techniques" | "composition_exports">;
  files: Map<string, string>;
}): ValidateResult {
  const code = [...input.files.values()].join("\n");
  const missing: string[] = [];

  for (const compId of input.expected.compositions) {
    const sig = COMPOSITION_SIGNATURES[compId];
    if (sig && !sig.test(code)) {
      const exportName = input.expected.composition_exports?.[
        input.expected.compositions.indexOf(compId)
      ];
      if (exportName && !new RegExp(`<${exportName}[\\s/>]`).test(code)) {
        missing.push(`composição ${compId} (${exportName})`);
      }
    }
  }

  for (const techId of input.expected.techniques) {
    const patterns = TECHNIQUE_SIGNATURES[techId];
    if (patterns && !patterns.some((p) => p.test(code))) {
      missing.push(`técnica ${techId}`);
    }
  }

  if (/HeroSignature/.test(code) && /BentoGrid/.test(code) && !/HeroCinematic|HeroEditorial|HeroBrutalist|KineticHeadline/.test(code)) {
    missing.push("anti-pattern HeroSignature+BentoGrid genérico");
  }

  const pass = missing.length === 0;
  return {
    pass,
    missing,
    feedback: pass
      ? "Design validate OK — assinaturas do brief presentes"
      : `Craft incompleto — faltam: ${missing.join(", ")}`,
  };
}