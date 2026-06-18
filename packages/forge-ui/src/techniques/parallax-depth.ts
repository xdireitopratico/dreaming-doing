import type { Technique } from "./types";

/**
 * ParallaxDepth — parallax multi-camada. Camadas diferentes movem-se a
 * velocidades diferentes no scroll, criando profundidade real (não o parallax
 * amador de uma camada). Fundo lento, meio médio, frente rápida.
 */
export const PARALLAX_DEPTH: Technique = {
  id: "parallax-depth",
  name: "ParallaxDepth",
  concept: "Camadas movem-se a velocidades diferentes no scroll — fundo lento, frente rápida — criando ilusão de profundidade 3D.",
  whenToUse: "Heroes imersivos, showcases de produto, seções que precisam de respiro e drama. Cautela em mobile (use speed baixo).",
  pairsWith: ["scroll-reveal", "sticky-stack", "animated-mesh-background"],
  primitives: ["Parallax", "useScrollProgress"],
  reference: `import { Parallax } from "@forge/ui";

// Três camadas, três velocidades. O segredo é a DIFERENÇA de velocidade entre
// elas — não a velocidade absoluta.
export function ParallaxHero({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative min-h-dvh overflow-hidden">
      {/* Fundo: bem lento */}
      <Parallax speed={0.15} className="absolute inset-0 -z-20">
        <div className="h-[120%] bg-[radial-gradient(ellipse_at_50%_30%,var(--color-brand-500)_18%,transparent_60%)] opacity-40" />
      </Parallax>
      {/* Meio: médio */}
      <Parallax speed={0.35} className="absolute inset-0 -z-10">
        <div className="h-[110%] bg-[radial-gradient(circle_at_80%_60%,var(--color-accent-500)_12%,transparent_50%)]" />
      </Parallax>
      {/* Frente: conteúdo natural (sem parallax ou speed alto) */}
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl items-center px-6">
        {children}
      </div>
    </section>
  );
}`,
};
