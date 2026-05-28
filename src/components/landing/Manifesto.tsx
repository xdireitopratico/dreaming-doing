import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

/**
 * Manifesto curto, scroll-linked. Tom de acolhimento, não de medo.
 * Palavras-chave em prata, sublinhadas por SVG path drawing.
 */
export function Manifesto() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.8", "end 0.3"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.3, 1], [0.25, 1, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [40, 0]);

  return (
    <section id="manifesto" className="relative px-6 py-32 md:py-44">
      <div ref={ref} className="mx-auto max-w-[1080px]">
        <div className="text-[11px] uppercase tracking-[0.24em] text-sun mb-6">Manifesto</div>

        <motion.h2
          style={{ opacity, y }}
          className="font-display text-[40px] sm:text-[56px] md:text-[72px] leading-[1.05] tracking-tight max-w-[14ch]"
        >
          Software pode ser tão{" "}
          <Highlight>simples</Highlight> quanto descrevê-lo.
          E tão <Highlight delay={0.4}>seu</Highlight> quanto sempre deveria ter sido.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-12 text-[16px] md:text-[18px] text-silver max-w-[64ch] leading-relaxed"
        >
          A gente acredita que criar deveria parecer mágica. E que mágica de verdade é
          aquela que você entende, controla e leva pra casa. Não é caixa-preta. É vitrine.
          Você vê cada decisão, vê cada custo, e sai daqui com o que construiu —
          inteiro, no seu nome.
        </motion.p>
      </div>
    </section>
  );
}

function Highlight({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <span className="relative inline-block text-foreground">
      <span className="relative z-10">{children}</span>
      <svg
        aria-hidden
        className="absolute -bottom-1 left-0 w-full h-[10px] z-0"
        viewBox="0 0 200 12"
        fill="none"
        preserveAspectRatio="none"
      >
        <motion.path
          d="M2 8 Q 60 2, 120 6 T 198 5"
          stroke="var(--sun)"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, amount: 0.7 }}
          transition={{ duration: 1.4, delay, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
    </span>
  );
}
