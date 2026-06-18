import type { Technique } from "./types";

/**
 * StickyStack — seções fixam no viewport e empilham. Cada nova cobre a
 * anterior enquanto você rola, com um leve recuo de escala. Cria a sensação
 * de "camadas que se constroem" — storytelling de produto premium (Apple-style).
 */
export const STICKY_STACK: Technique = {
  id: "sticky-stack",
  name: "StickyStack",
  concept: "Seções fixam no topo e empilham — cada nova cobre a anterior com leve recuo de escala, criando profundidade narrativa.",
  whenToUse: "Storytelling de produto, reveal progressivo de features, narrativa em etapas. Evite em conteúdo denso/longo.",
  pairsWith: ["scroll-reveal", "parallax-depth", "count-up-metrics"],
  primitives: ["motion"],
  reference: `import { motion } from "framer-motion";

// position: sticky faz fixar; whileInView com margin negativo dispara o recuo
// quando a próxima seção começa a cobrir.
export function StickyStack({
  sections,
}: {
  sections: { kicker: string; title: string; body: React.ReactNode }[];
}) {
  return (
    <div className="relative">
      {sections.map((s, i) => (
        <motion.section
          key={i}
          className="sticky top-0 flex min-h-dvh items-center justify-center bg-background"
          initial={{ scale: 1, opacity: 1 }}
          whileInView={{ scale: 0.94, opacity: 0.7 }}
          viewport={{ margin: "0px 0px -90% 0px" }}
          transition={{ type: "spring", stiffness: 200, damping: 30 }}
        >
          <div className="max-w-3xl px-6 text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-brand-500">{s.kicker}</p>
            <h2 className="font-display text-4xl font-semibold mt-3 md:text-6xl">{s.title}</h2>
            <div className="mt-6 text-lg text-muted-foreground">{s.body}</div>
          </div>
        </motion.section>
      ))}
    </div>
  );
}`,
};
