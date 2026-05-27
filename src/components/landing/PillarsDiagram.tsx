import { motion } from "motion/react";
import { Shield, Eye, Plug, Languages } from "lucide-react";
import { useState } from "react";

const pillars = [
  {
    id: "soberania",
    icon: Shield,
    label: "Soberania",
    title: "Sua infra. Seu código. Sem permissão.",
    body: "Conecte seu Supabase em 30 segundos. Sua chave de IA. Seu GitHub. Você é dono de cada linha desde o primeiro prompt — e pode levar embora a qualquer momento.",
  },
  {
    id: "transparencia",
    icon: Eye,
    label: "Transparência",
    title: "O agente é uma caixa de vidro.",
    body: "Cada chamada de ferramenta streamada em tempo real. Cada token contabilizado. Cada arquivo diffado. Você sabe exatamente o que a IA fez e quanto custou — sempre.",
  },
  {
    id: "mcp",
    icon: Plug,
    label: "MCP-nativo",
    title: "Qualquer ferramenta. Sua stack.",
    body: "Plugue qualquer servidor Model Context Protocol em minutos: Notion, Linear, seu CRM interno, sua API privada. Sua caixa de ferramentas, suas regras.",
  },
  {
    id: "portugues",
    icon: Languages,
    label: "PT-BR primeiro",
    title: "Português de verdade, não traduzido.",
    body: "Agente, prompts internos e documentação pensados em português brasileiro desde o início. Sem aquela tradução automática esquisita que quebra na hora errada.",
  },
];

export function PillarsDiagram() {
  const [active, setActive] = useState(0);
  const current = pillars[active];

  return (
    <div className="grid lg:grid-cols-[1fr_1.1fr] gap-10 items-center">
      {/* Diagrama */}
      <div className="relative aspect-square max-w-[440px] mx-auto w-full">
        <div className="absolute inset-0 rounded-full" style={{ background: "var(--gradient-hero)" }} />
        <svg viewBox="0 0 400 400" className="absolute inset-0 w-full h-full">
          <circle cx="200" cy="200" r="120" fill="none" stroke="var(--border)" strokeDasharray="3 5" />
          <circle cx="200" cy="200" r="70" fill="none" stroke="var(--border-strong)" />
          <text x="200" y="205" textAnchor="middle" className="fill-foreground font-display" fontSize="22">
            você
          </text>
        </svg>
        {pillars.map((p, i) => {
          const angle = (i / pillars.length) * Math.PI * 2 - Math.PI / 2;
          const r = 165;
          const x = 50 + (Math.cos(angle) * r) / 4;
          const y = 50 + (Math.sin(angle) * r) / 4;
          const Icon = p.icon;
          const isActive = i === active;
          return (
            <button
              key={p.id}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              className="absolute -translate-x-1/2 -translate-y-1/2 transition-all"
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-label={p.label}
            >
              <motion.div
                animate={{
                  scale: isActive ? 1.1 : 1,
                  borderColor: isActive ? "var(--primary)" : "var(--border-strong)",
                }}
                className="size-16 rounded-2xl bg-surface border-2 grid place-items-center shadow-[var(--shadow-soft)]"
              >
                <Icon className={`size-6 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
              </motion.div>
              <div
                className={`text-[10px] mt-2 uppercase tracking-[0.15em] text-center ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {p.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Card lateral */}
      <motion.div
        key={current.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-2xl border border-border bg-surface/60 backdrop-blur p-8 shadow-[var(--shadow-soft)]"
      >
        <div className="text-xs uppercase tracking-[0.2em] text-primary mb-3">{current.label}</div>
        <h3 className="font-display text-3xl md:text-4xl leading-tight mb-4">{current.title}</h3>
        <p className="text-muted-foreground text-[15px] leading-relaxed">{current.body}</p>
        <div className="mt-6 flex gap-1.5">
          {pillars.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setActive(i)}
              className={`h-1 rounded-full transition-all ${i === active ? "w-8 bg-primary" : "w-3 bg-border-strong"}`}
              aria-label={`Ver ${p.label}`}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
