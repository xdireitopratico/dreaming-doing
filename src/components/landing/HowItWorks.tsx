import { motion } from "motion/react";
import { MessageSquare, Cpu, Rocket } from "lucide-react";

const STEPS = [
  {
    icon: MessageSquare,
    n: "01",
    title: "Descreva em português",
    body: "Conte o que você quer construir. Em uma frase ou em três parágrafos — do seu jeito.",
  },
  {
    icon: Cpu,
    n: "02",
    title: "Veja a IA pensar",
    body: "O agente lê, planeja, escolhe ferramentas, escreve código. Cada passo aparece em tempo real na sua frente.",
  },
  {
    icon: Rocket,
    n: "03",
    title: "Lance no seu domínio",
    body: "Deploy num clique pra Cloudflare, Vercel ou Netlify. Código no seu GitHub, dados no seu Supabase.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="relative px-6 py-28 md:py-36">
      <div className="mx-auto max-w-[1120px]">
        <div className="text-[11px] uppercase tracking-[0.24em] text-ignition mb-6">Sequência de lançamento</div>
        <h2 className="font-display text-4xl md:text-6xl leading-[1.05] max-w-3xl mb-16">
          Três passos. <span className="text-silver">Nenhum mistério.</span>
        </h2>

        <div className="grid md:grid-cols-3 gap-5">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.6, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="relative rounded-2xl border border-border bg-surface/40 backdrop-blur-xl p-7 dw-starlight"
                data-magnetic
              >
                <div className="flex items-start justify-between mb-8">
                  <div className="size-12 rounded-xl border border-border-strong bg-background grid place-items-center">
                    <Icon className="size-5 text-ignition" />
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground tracking-[0.2em]">{s.n}</div>
                </div>
                <div className="font-display text-2xl leading-tight mb-3">{s.title}</div>
                <p className="text-silver text-[14px] leading-relaxed">{s.body}</p>

                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 size-6 rounded-full bg-background border border-border-strong z-10 grid place-items-center">
                    <span className="text-ignition text-xs">→</span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
