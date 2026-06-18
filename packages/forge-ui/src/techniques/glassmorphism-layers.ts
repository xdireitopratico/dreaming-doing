import type { Technique } from "./types";

/**
 * GlassmorphismLayers — profundidade via blur + translucência. Camadas
 * semi-transparentes sobre fundos em movimento criam a sensação de vidro
 * fosco premium. Funciona SOBRE mesh/parallax (precisa de algo atrás pra
 * mostrar o blur).
 */
export const GLASSMORPHISM_LAYERS: Technique = {
  id: "glassmorphism-layers",
  name: "GlassmorphismLayers",
  concept: "Camadas semi-transparentes com blur — vidro fosco premium que mostra o que há atrás, criando profundidade real.",
  whenToUse: "Navbars fixas, cards sobre heros com mesh/parallax, modais. PRECISA de conteúdo animado atrás pra funcionar.",
  pairsWith: ["animated-mesh-background", "parallax-depth", "spotlight-cursor"],
  primitives: [],
  reference: `// Glassmorphism é CSS puro — não precisa de primitiva. O segredo: backdrop-blur
// + borda sutil + fundo semi-transparente, SOBRE um fundo com movimento.

export function GlassNav({ children }: { children: React.ReactNode }) {
  return (
    <nav className="sticky top-4 z-50 mx-auto max-w-5xl rounded-2xl border border-white/10 bg-surface-1/60 px-6 py-3 backdrop-blur-xl">
      {children}
    </nav>
  );
}

export function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface-2/40 p-6 backdrop-blur-md shadow-xl">
      {children}
    </div>
  );
}

// Regra: NUNCA use glass sobre fundo chapado — o blur não tem o que mostrar.
// Sempre sobre mesh/parallax/imagem. Borda branca 10% é o que dá o "edge" do vidro.`,
};
