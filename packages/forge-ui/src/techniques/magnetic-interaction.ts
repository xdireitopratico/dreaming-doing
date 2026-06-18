import type { Technique } from "./types";

/**
 * MagneticInteraction — elementos-chave atraem o cursor. É a micro-interação
 * que separa "botão estático" de "botão que parece vivo". Use em CTAs
 * principais e elementos de foco — com contenção (não em tudo).
 */
export const MAGNETIC_INTERACTION: Technique = {
  id: "magnetic-interaction",
  name: "MagneticInteraction",
  concept: "Elementos-chave atraem suavemente o cursor — micro-interação que dá vida e dirige atenção ao CTA principal.",
  whenToUse: "CTA primário do hero, botões de ação importante, cards de destaque. NÃO use em tudo — perde o efeito e vira poluição.",
  pairsWith: ["tilt-hover", "spotlight-cursor", "kinetic-typography"],
  primitives: ["MagneticButton"],
  reference: `import { MagneticButton } from "@forge/ui";
import { motion } from "framer-motion";

// O CTA primário atrai o cursor. Ajuste strength: 0.2 sutil, 0.5 ousado.
export function HeroCTA() {
  return (
    <MagneticButton
      strength={0.4}
      className="rounded-full bg-brand-500 px-8 py-4 text-lg font-semibold text-brand-500-foreground shadow-glow"
    >
      Começar agora
    </MagneticButton>
  );
}

// Para imagens/cards: envolva em motion com useMotionValue + useSpring,
// replicando a física (ver MagneticButton em @forge/ui/components/Motion).
// Contenção é tudo: um elemento magnético por seção de foco.`,
};
