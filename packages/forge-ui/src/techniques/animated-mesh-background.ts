import type { Technique } from "./types";

/**
 * AnimatedMeshBackground — atmosfera de gradiente em movimento lento. Não é
 * um "fundo bonito estático", é um céu que respira. Define o mood da página
 * antes de qualquer conteúdo. Combina com parallax.
 */
export const ANIMATED_MESH_BACKGROUND: Technique = {
  id: "animated-mesh-background",
  name: "AnimatedMeshBackground",
  concept: "Gradientes em movimento lento e contínuo no fundo — um céu que respira, definindo o mood antes do conteúdo.",
  whenToUse: "Hero, seções de impacto, backgrounds de app. Sutil (opacity baixa) — é atmosfera, não protagonista.",
  pairsWith: ["parallax-depth", "kinetic-typography", "grain-texture-overlay"],
  primitives: ["motion"],
  reference: `import { motion } from "framer-motion";

// Dois blobs com gradiente animando em loop, opacidade baixa, blur alto.
// As cores vêm do mood (use var(--color-brand-500), var(--color-accent-500)).
export function MeshBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute -left-1/4 top-0 h-[60vh] w-[60vh] rounded-full opacity-30 blur-[120px]"
        style={{ background: "var(--color-brand-500)" }}
        animate={{ x: [0, 80, 0], y: [0, 40, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-0 bottom-0 h-[50vh] w-[50vh] rounded-full opacity-25 blur-[120px]"
        style={{ background: "var(--color-accent-500)" }}
        animate={{ x: [0, -60, 0], y: [0, -30, 0], scale: [1, 1.2, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}`,
};
