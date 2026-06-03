import { motion } from "framer-motion";
import { useEffect } from "react";
import { PromptEngine } from "@/components/prompt/PromptEngine";

const HEADLINE = "Construa o inimaginável.";

// Deterministic pseudo-random so SSR and client agree (avoids hydration mismatch).
function seeded(i: number, salt: number) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function AnimatedHeadline() {
  const letters = HEADLINE.split("");
  return (
    <h1 className="font-display font-bold text-[clamp(2.6rem,7.5vw,7.2rem)] leading-[0.95] tracking-[-0.02em]">
      {letters.map((ch, i) => {
        if (ch === " ") return <span key={i}>&nbsp;</span>;
        const rot = (seeded(i, 1) - 0.5) * 24;
        const y = 40 + seeded(i, 2) * 50;
        return (
          <motion.span
            key={i}
            initial={{ opacity: 0, y, rotate: rot, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, rotate: 0, filter: "blur(0)" }}
            transition={{
              delay: 0.2 + i * 0.04,
              type: "spring",
              stiffness: 80,
              damping: 15,
            }}
            className="inline-block text-gradient-cool"
            style={{ willChange: "transform" }}
          >
            {ch}
          </motion.span>
        );
      })}
    </h1>
  );
}

export function Hero() {
  useEffect(() => {
    const s = (window as unknown as { __forgeScene?: { scroll: number } })
      .__forgeScene;
    if (s) s.scroll = 0;
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 pt-24">
      <div className="relative z-10 max-w-5xl text-center w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--text-dim)] mb-8 border border-[var(--border)] glass rounded-full px-4 py-1.5"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] live-dot" />
          FORGE · WEB APP BUILDER · v1.0
        </motion.div>

        <AnimatedHeadline />

        <motion.p
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0)" }}
          transition={{ delay: 1.0, duration: 0.8 }}
          className="mt-8 font-body text-lg md:text-xl text-[var(--text-dim)] max-w-2xl mx-auto leading-relaxed"
        >
          Descreva. Nós escrevemos o código, configuramos o stack, fazemos o deploy.
        </motion.p>

        <PromptEngine size="hero" />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="absolute -bottom-10 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--text-ghost)]"
        >
          ↓ SCROLL TO INITIATE LAUNCH SEQUENCE
        </motion.div>
      </div>
    </section>
  );
}
