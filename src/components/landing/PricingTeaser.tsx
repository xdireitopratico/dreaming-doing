import { motion } from "motion/react";
import { Check } from "lucide-react";

const TIERS = [
  {
    name: "Você primeiro",
    price: "R$ 0",
    sub: "para começar",
    features: ["Prompt ilimitado em modelos abertos", "Conecte seu Supabase e GitHub", "Comunidade no Discord"],
    cta: "Começar grátis",
  },
  {
    name: "Soberano",
    price: "R$ 29",
    sub: "/mês — você gerencia seus créditos",
    features: [
      "Sua chave de IA (Anthropic, OpenAI, Groq, Gemini)",
      "Pague o LLM direto no provedor — sem markup",
      "Deploy automático Vercel / Cloudflare",
      "Suporte por email em 24h",
    ],
    cta: "Pré-cadastro",
    highlight: true,
  },
  {
    name: "Estúdio",
    price: "Sob medida",
    sub: "para times",
    features: ["Tudo do Soberano", "MCP privado da sua empresa", "SSO + auditoria completa", "Onboarding 1-a-1"],
    cta: "Falar com a gente",
  },
];

export function PricingTeaser() {
  return (
    <section id="precos" className="relative px-6 py-28 md:py-40">
      <div className="mx-auto max-w-[1120px]">
        <div className="text-[11px] uppercase tracking-[0.24em] text-sun mb-6">Preços honestos</div>
        <h2 className="font-display text-4xl md:text-6xl leading-[1.05] max-w-3xl mb-6">
          Assinatura mínima. <span className="text-silver">Você decide o resto.</span>
        </h2>
        <p className="text-silver text-[16px] max-w-[60ch] leading-relaxed mb-14">
          Em vez de comprar créditos da gente, você traz suas chaves e paga o que usar
          direto no provedor. Sem markup, sem surpresa no fim do mês.
        </p>

        <div className="grid md:grid-cols-3 gap-5">
          {TIERS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className={`rounded-2xl border p-7 flex flex-col ${
                t.highlight
                  ? "border-sun/40 bg-surface shadow-[var(--shadow-glow)] relative"
                  : "border-border bg-surface/40 backdrop-blur"
              }`}
            >
              {t.highlight && (
                <div className="absolute -top-3 left-7 px-2 py-0.5 rounded-full bg-sun text-accent-foreground font-mono text-[10px] uppercase tracking-[0.18em]">
                  Recomendado
                </div>
              )}
              <div className="font-display text-2xl mb-1">{t.name}</div>
              <div className="font-display text-4xl mt-3">{t.price}</div>
              <div className="text-[12px] text-muted-foreground mb-6">{t.sub}</div>
              <ul className="space-y-3 mb-8 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-[14px] text-foreground/90">
                    <Check className="size-4 text-sun shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                className={`w-full rounded-md py-2.5 text-[13px] font-medium transition-colors ${
                  t.highlight
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border-strong hover:bg-secondary"
                }`}
              >
                {t.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
