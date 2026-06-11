import { Link } from "@tanstack/react-router";
import { motion, useInView } from "framer-motion";
import { useEffect, useRef } from "react";

const WORDS = ["Está", "a", "um", "prompt", "de", "distância."];
const DIRS = [
  { x: -200, y: 0 },
  { x: 200, y: 0 },
  { x: 0, y: -200 },
  { x: 0, y: 200 },
  { x: -150, y: -150 },
  { x: 150, y: 150 },
];

export function FinalCTA() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.4 });

  useEffect(() => {
    const s = (
      window as unknown as {
        __forgeScene?: { intensity: number };
      }
    ).__forgeScene;
    if (s) s.intensity = inView ? 2.2 : 1.0;
  }, [inView]);

  const btnRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 220) {
        const p = (1 - dist / 220) * 18;
        el.style.transform = `translate(${(dx / dist) * p}px, ${(dy / dist) * p}px)`;
      } else {
        el.style.transform = "translate(0,0)";
      }
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <section
      id="cta"
      ref={ref}
      className="relative z-10 min-h-screen flex items-center justify-center px-6 overflow-hidden scroll-mt-24"
    >
      {/* radiating rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="absolute rounded-full border border-[var(--primary)]/15"
            style={{
              width: `${i * 220}px`,
              height: `${i * 220}px`,
              animation: `live-dot ${4 + i}s ease-out infinite`,
              animationDelay: `${i * 0.4}s`,
            }}
          />
        ))}
      </div>

      <div className="relative text-center max-w-4xl">
        <p className="font-mono text-xs tracking-[0.3em] uppercase text-[var(--primary)] mb-8">
          ✦ FINAL APPROACH
        </p>
        <h2 className="font-display font-bold text-[clamp(2.6rem,7vw,6.5rem)] leading-[1.0] tracking-[-0.02em]">
          {WORDS.map((w, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, x: DIRS[i].x, y: DIRS[i].y, filter: "blur(12px)" }}
              whileInView={{ opacity: 1, x: 0, y: 0, filter: "blur(0)" }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{
                type: "spring",
                stiffness: 70,
                damping: 14,
                delay: i * 0.08,
              }}
              className="inline-block mx-2"
            >
              {i === 3 ? <span className="text-gradient">{w}</span> : w}
            </motion.span>
          ))}
        </h2>
        <p className="mt-8 font-body text-lg text-[var(--text-dim)]">
          Sem cartão. Sem configuração. Apenas criação.
        </p>
        <div className="mt-12 flex justify-center">
          <Link
            ref={btnRef}
            to="/projects"
            data-cursor="hover"
            className="inline-block font-mono text-sm tracking-[0.25em] uppercase px-10 py-5 bg-[var(--primary)] text-[#0a0408] hover:bg-[var(--tertiary)] transition-colors glow-primary"
            style={{ transition: "transform 200ms ease-out, background 200ms" }}
          >
            ✦ COMEÇAR AGORA — É GRÁTIS
          </Link>
        </div>
      </div>
    </section>
  );
}
