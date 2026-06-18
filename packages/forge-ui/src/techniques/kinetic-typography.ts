import type { Technique } from "./types";

/**
 * KineticTypography — tipografia que se anima. Letras que surgem uma a uma,
 * máscara que revela o título, gradiente que desliza. O título do hero é o
 * elemento de maior alavanca de "caralho, profissional fez isso".
 */
export const KINETIC_TYPOGRAPHY: Technique = {
  id: "kinetic-typography",
  name: "KineticTypography",
  concept: "Tipografia animada — letras surgem escalonadas, máscara revela o título, brilho desliza. O hero ganha personalidade.",
  whenToUse: "Headline do hero, títulos de seção de impacto, nomes de marca. É o gesto-memorável mais barato de alto impacto.",
  pairsWith: ["scroll-reveal", "magnetic-interaction", "animated-mesh-background"],
  primitives: ["RevealMask", "TextShimmer", "StaggerContainer", "StaggerItem"],
  reference: `import { RevealMask, TextShimmer, StaggerContainer, StaggerItem } from "@forge/ui";
import { motion } from "framer-motion";

// Reveal por máscara + letras escalonadas. Cada letra é um StaggerItem.
export function KineticTitle({ text }: { text: string }) {
  return (
    <RevealMask className="font-display text-6xl font-bold tracking-tight md:text-8xl">
      <StaggerContainer className="flex flex-wrap" staggerChildren={0.04}>
        {text.split("").map((ch, i) => (
          <StaggerItem key={i}>
            <span className="inline-block">{ch === " " ? "\\u00A0" : ch}</span>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </RevealMask>
  );
}

// Para um subtítulo/destaque: brilho deslizante no texto.
export function ShimmerLine({ children }: { children: React.ReactNode }) {
  return <TextShimmer className="text-2xl font-medium">{children}</TextShimmer>;
}

// Adapte: combine máscara + stagger só no hero. Em outras seções, menos.`,
};
