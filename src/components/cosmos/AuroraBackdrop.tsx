import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { StarField } from "./StarField";

/**
 * Fundo cósmico fixo: estrelas + aurora gradiente com parallax leve.
 * Vai atrás de todo conteúdo. Sem interceptar pointer events.
 */
export function AuroraBackdrop() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 1200], [0, -180]);
  const y2 = useTransform(scrollY, [0, 1200], [0, -90]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{ background: "var(--gradient-cosmos)" }}
    >
      <motion.div
        className="absolute inset-0"
        style={{ background: "var(--gradient-aurora)", y: reduce ? 0 : y1 }}
      />
      <motion.div
        className="absolute inset-0"
        style={{ y: reduce ? 0 : y2 }}
      >
        <StarField />
      </motion.div>
    </div>
  );
}
