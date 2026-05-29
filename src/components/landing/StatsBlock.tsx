import { motion } from "motion/react";
import { AnimatedCounter } from "./AnimatedCounter";

const STATS = [
  { value: 2847, suffix: "+", label: "projetos lançados na beta" },
  { value: 99.4, suffix: "%", decimals: 1, label: "uptime do agente nos últimos 90 dias" },
  { value: 4.2,  suffix: "min", decimals: 1, label: "tempo médio do prompt ao deploy" },
];

export function StatsBlock() {
  return (
    <section className="relative px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1120px]">
        <div className="grid md:grid-cols-3 gap-12 md:gap-6">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.6, delay: i * 0.12 }}
              className="text-center md:text-left"
            >
              <div className="font-display text-6xl md:text-7xl leading-none">
                <span className="bg-gradient-ignition bg-clip-text text-transparent">
                  <AnimatedCounter to={s.value} suffix={s.suffix} decimals={s.decimals ?? 0} />
                </span>
              </div>
              <div className="text-silver text-[14px] mt-4 max-w-[28ch] mx-auto md:mx-0">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
