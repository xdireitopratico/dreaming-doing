import type { Technique } from "./types";

/**
 * GrainTextureOverlay — textura de grão (noise) sutil sobre toda a página.
 * É o detalhe mais subestimado e mais "caro": sites premium têm grão, sites
 * amadores não. Reduz a artificialidade das cores chapadas. Quase grátis.
 */
export const GRAIN_TEXTURE_OVERLAY: Technique = {
  id: "grain-texture-overlay",
  name: "GrainTextureOverlay",
  concept: "Textura de grão (noise) ultrassutil sobre a página — o detalhe que sites premium têm e amadores não. Reduz artificialidade.",
  whenToUse: "TODA página. É uma camada fixa, opacity ~4-8%, pointer-events none. Custo zero, percepção de polish alta.",
  pairsWith: ["animated-mesh-background", "glassmorphism-layers", "parallax-depth"],
  primitives: [],
  reference: `// Grão via SVG fractal noise inline. Uma camada fixed, cobre tudo, não
// intercepta cliques. Cole no App.tsx (fora do roteamento).
export function GrainOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[999] opacity-[0.05] mix-blend-soft-light"
      style={{
        backgroundImage:
          "url(\\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\\")",
      }}
    />
  );
}

// Ajuste opacity entre 0.03 e 0.08. mix-blend-soft-light integra sem lavar a cor.
// Em moods claros (sand), use opacity 0.04 e mix-blend-multiply.`,
};
