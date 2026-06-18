import type { Technique } from "./types";

/**
 * CountUpMetrics — números animam do zero ao valor ao entrar no viewport.
 * StatsRibbons e provas sociais ganham vida e direcionam o olhar. Pequeno
 * detalhe, grande percepção de polish.
 */
export const COUNT_UP_METRICS: Technique = {
  id: "count-up-metrics",
  name: "CountUpMetrics",
  concept: "Números contam do zero ao valor ao entrar no viewport — stats e provas sociais ganham dinamismo e credibilidade.",
  whenToUse: "Faixa de métricas, prova social, números de impacto. 3-4 métricas por faixa, não mais.",
  pairsWith: ["scroll-reveal", "sticky-stack", "infinite-marquee"],
  primitives: ["CountUp", "Reveal"],
  reference: `import { CountUp, Reveal } from "@forge/ui";

export function StatsRibbon({
  stats,
}: {
  stats: { value: number; suffix?: string; label: string }[];
}) {
  return (
    <Reveal direction="up" className="grid grid-cols-2 gap-8 md:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="text-center">
          <div className="font-display text-5xl font-bold text-brand-500">
            <CountUp to={s.value} suffix={s.suffix} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </Reveal>
  );
}`,
};
