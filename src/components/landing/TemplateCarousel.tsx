import { motion } from "motion/react";
import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

const TEMPLATES = [
  { title: "SaaS Dashboard",     prompt: "Painel admin com Supabase, auth e gráficos", tag: "Pro", hue: "from-[oklch(0.69_0.18_258)] to-[oklch(0.58_0.24_295)]" },
  { title: "Landing de produto", prompt: "Hero + features + CTA + formulário",        tag: "Express", hue: "from-[oklch(0.72_0.17_165)] to-[oklch(0.69_0.18_258)]" },
  { title: "Loja artesanal",     prompt: "E-commerce simples com Stripe e estoque",   tag: "Pro", hue: "from-[oklch(0.86_0.16_85)] to-[oklch(0.69_0.18_258)]" },
  { title: "Portfólio fotógrafo",prompt: "Galeria editorial com slideshow",            tag: "Express", hue: "from-[oklch(0.58_0.24_295)] to-[oklch(0.72_0.17_165)]" },
  { title: "CRM interno",        prompt: "Cards, pipeline, deals e contatos",         tag: "Pro", hue: "from-[oklch(0.69_0.18_258)] to-[oklch(0.86_0.16_85)]" },
  { title: "Blog editorial",     prompt: "MDX + categorias + busca + RSS",             tag: "Express", hue: "from-[oklch(0.72_0.17_165)] to-[oklch(0.58_0.24_295)]" },
];

export function TemplateCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; sl: number } | null>(null);

  return (
    <section className="relative px-6 py-28 md:py-36">
      <div className="mx-auto max-w-[1120px]">
        <div className="flex items-end justify-between gap-6 mb-12 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-ignition mb-6">Templates pra começar</div>
            <h2 className="font-display text-4xl md:text-6xl leading-[1.05] max-w-2xl">
              Arraste, escolha,<br />
              <span className="text-silver">comece em 30 segundos.</span>
            </h2>
          </div>
          <div className="text-[12px] text-muted-foreground max-w-[260px]">
            Cada template já vem com schema, RLS e deploy pré-configurado.
          </div>
        </div>

        <div
          ref={trackRef}
          className="overflow-x-auto pb-4 -mx-6 px-6 cursor-grab active:cursor-grabbing select-none mask-fade"
          style={{ scrollbarWidth: "none" }}
          onMouseDown={(e) => {
            if (!trackRef.current) return;
            setDrag({ x: e.clientX, sl: trackRef.current.scrollLeft });
          }}
          onMouseMove={(e) => {
            if (!drag || !trackRef.current) return;
            trackRef.current.scrollLeft = drag.sl - (e.clientX - drag.x);
          }}
          onMouseUp={() => setDrag(null)}
          onMouseLeave={() => setDrag(null)}
        >
          <div className="flex gap-5 min-w-max">
            {TEMPLATES.map((t, i) => (
              <motion.button
                key={t.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                data-magnetic
                className="group w-[280px] md:w-[320px] shrink-0 text-left rounded-2xl border border-border bg-surface/40 backdrop-blur-xl overflow-hidden hover:border-ignition/40 transition-colors"
              >
                <div className={`h-[160px] bg-gradient-to-br ${t.hue} relative overflow-hidden`}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,white_0%,transparent_60%)] opacity-20" />
                  <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur text-white text-[10px] font-mono uppercase tracking-[0.18em]">
                    {t.tag}
                  </div>
                </div>
                <div className="p-5">
                  <div className="font-display text-xl leading-tight mb-2">{t.title}</div>
                  <div className="font-mono text-[11px] text-muted-foreground mb-4 line-clamp-2">"{t.prompt}"</div>
                  <div className="inline-flex items-center gap-1.5 text-[12px] text-ignition group-hover:gap-2.5 transition-all">
                    Usar template <ArrowRight className="size-3" />
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
