import { motion } from "motion/react";
import { Zap, Eye, GitBranch, Lock, Globe2, Cpu } from "lucide-react";
import { useTilt } from "@/hooks/useTilt";

const FEATURES = [
  { icon: Zap,       title: "Streaming real-time",    body: "Tool-calls e diffs aparecem token a token. Você vê tudo enquanto acontece." },
  { icon: Eye,       title: "Custo no centavo",        body: "Contador honesto por modelo, por prompt. Nada de fatura surpresa." },
  { icon: GitBranch, title: "Git nativo, sempre",      body: "Cada turno do agente vira commit assinado no seu repo. Histórico limpo." },
  { icon: Lock,      title: "Chaves cifradas",         body: "Suas API keys ficam no seu Supabase, cifradas. A gente nunca toca." },
  { icon: Globe2,    title: "Deploy em 3 nuvens",      body: "Cloudflare, Vercel, Netlify — escolhe. Domínio próprio em 1 clique." },
  { icon: Cpu,       title: "MCP-nativo",              body: "Conecte qualquer ferramenta MCP. Notion, Linear, n8n, sua API interna." },
];

export function FeatureGrid() {
  return (
    <section id="features" className="relative px-6 py-28 md:py-36">
      <div className="mx-auto max-w-[1120px]">
        <div className="text-[11px] uppercase tracking-[0.24em] text-ignition mb-6">O que você ganha</div>
        <h2 className="font-display text-4xl md:text-6xl leading-[1.05] max-w-3xl mb-16">
          Recursos que respeitam<br />
          <span className="text-silver">a sua inteligência.</span>
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature, index }: { feature: typeof FEATURES[number]; index: number }) {
  const { ref, style, onMove, onMouseLeave } = useTilt(8);
  const Icon = feature.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay: index * 0.06 }}
    >
      <div
        ref={ref}
        onMouseMove={onMove as any}
        onMouseLeave={onMouseLeave}
        style={style}
        data-magnetic
        className="rounded-2xl border border-border bg-surface/40 backdrop-blur-xl p-6 dw-starlight h-full"
      >
        <div className="size-10 rounded-lg bg-background border border-border-strong grid place-items-center mb-5">
          <Icon className="size-4 text-ignition" />
        </div>
        <div className="font-display text-xl leading-tight mb-2">{feature.title}</div>
        <p className="text-silver text-[13.5px] leading-relaxed">{feature.body}</p>
      </div>
    </motion.div>
  );
}
