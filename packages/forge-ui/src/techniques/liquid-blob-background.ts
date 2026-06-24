import type { Technique } from "./types";

/**
 * LiquidBlobBackground — blobs orgânicos com efeito gooey (CSS filter).
 * Mais expressivo que mesh estático — parece líquido vivo. Em mobile,
 * degrade para gradiente estático (performance + legibilidade).
 */
export const LIQUID_BLOB_BACKGROUND: Technique = {
  id: "liquid-blob-background",
  name: "LiquidBlobBackground",
  concept: "Blobs orgânicos com efeito gooey — líquido vivo no fundo, mais expressivo que gradiente estático.",
  whenToUse: "Heroes ousados, landings criativas, seções de marca. Degrade em mobile: gradiente estático ou mesh simples.",
  pairsWith: ["glassmorphism-layers", "kinetic-typography", "grain-texture-overlay"],
  primitives: ["motion"],
  reference: `import { motion } from "framer-motion";
import { useEffect, useState } from "react";

// Gooey: filter:url(#goo) nos blobs + SVG defs. Mobile: fallback sem animação.
export function LiquidBlobBackground() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (isMobile) {
    return (
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, var(--color-brand-500) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, var(--color-accent-500) 0%, transparent 45%)",
          opacity: 0.35,
        }}
      />
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <svg className="absolute h-0 w-0" aria-hidden>
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      <div className="absolute inset-0" style={{ filter: "url(#goo)" }}>
        <motion.div
          className="absolute left-[10%] top-[15%] h-64 w-64 rounded-full opacity-50"
          style={{ background: "var(--color-brand-500)" }}
          animate={{ x: [0, 60, -20, 0], y: [0, 30, 50, 0], scale: [1, 1.2, 0.95, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-[5%] top-[40%] h-72 w-72 rounded-full opacity-45"
          style={{ background: "var(--color-accent-500)" }}
          animate={{ x: [0, -50, 30, 0], y: [0, -40, 20, 0], scale: [1, 0.9, 1.15, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[10%] left-[35%] h-56 w-56 rounded-full opacity-40"
          style={{ background: "var(--color-brand-400)" }}
          animate={{ x: [0, 40, -30, 0], y: [0, -25, 35, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}`,
};