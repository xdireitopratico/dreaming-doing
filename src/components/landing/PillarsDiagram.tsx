import { motion } from "motion/react";
import { Sparkles, Eye, Plug, Heart } from "lucide-react";
import { useRef, useState } from "react";

const pillars = [
  {
    id: "magia",
    icon: Sparkles,
    label: "Mágica que você entende",
    title: "Como nos filmes da Disney — só que o feitiço é seu.",
    body: "Cada efeito tem uma explicação. Você vê a IA pensar, propor, criar — e fica com o roteiro inteiro na mão. Mágica de verdade não é truque, é entendimento.",
  },
  {
    id: "vidro",
    icon: Eye,
    label: "Transparência total",
    title: "Cada passo, cada token, cada custo.",
    body: "Tool-calls streamados em tempo real. Diffs visíveis. Contadores honestos. Você sempre sabe o que está acontecendo — e quanto está custando, no centavo.",
  },
  {
    id: "stack",
    icon: Plug,
    label: "Sua stack favorita",
    title: "Conecte tudo que você já ama.",
    body: "Supabase, GitHub, Anthropic, Groq, n8n, MCP, seu CRM interno. A gente é cola — não correntão. Suas ferramentas, suas regras.",
  },
  {
    id: "seu",
    icon: Heart,
    label: "Seu, pra sempre",
    title: "Sem lock-in. Sem permissão. Sem medo.",
    body: "O código mora no seu Supabase, vai pro seu GitHub, faz deploy no seu Cloudflare. Se um dia você quiser sumir daqui, leva tudo embora num clique.",
  },
];

export function PillarsDiagram() {
  const [active, setActive] = useState(0);
  const current = pillars[active];

  return (
    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-12 items-center">
      {/* Diagrama orbital */}
      <div className="relative aspect-square max-w-[460px] mx-auto w-full">
        <div className="absolute inset-0 rounded-full" style={{ background: "var(--gradient-sun)" }} />
        <svg viewBox="0 0 400 400" className="absolute inset-0 w-full h-full">
          <circle cx="200" cy="200" r="160" fill="none" stroke="var(--border)" strokeDasharray="2 6" />
          <circle cx="200" cy="200" r="115" fill="none" stroke="var(--border)" strokeDasharray="2 6" />
          <circle cx="200" cy="200" r="70" fill="none" stroke="var(--border-strong)" />
          <text x="200" y="206" textAnchor="middle" className="fill-foreground font-display" fontSize="20">
            você
          </text>
        </svg>
        {pillars.map((p, i) => {
          const angle = (i / pillars.length) * Math.PI * 2 - Math.PI / 2;
          const r = 175;
          const x = 50 + (Math.cos(angle) * r) / 4;
          const y = 50 + (Math.sin(angle) * r) / 4;
          const Icon = p.icon;
          const isActive = i === active;
          return (
            <TiltCard key={p.id} x={x} y={y} active={isActive} onActivate={() => setActive(i)}>
              <Icon className={`size-6 ${isActive ? "text-sun" : "text-silver"}`} />
              <div className={`text-[10px] mt-2 uppercase tracking-[0.18em] text-center whitespace-nowrap ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}>
                {p.label.split(" ")[0]}
              </div>
            </TiltCard>
          );
        })}
      </div>

      {/* Card lateral */}
      <motion.div
        key={current.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-border bg-surface/60 backdrop-blur-xl p-8 md:p-10 shadow-[var(--shadow-soft)] dw-starlight"
      >
        <div className="text-[11px] uppercase tracking-[0.24em] text-sun mb-3">{current.label}</div>
        <h3 className="font-display text-3xl md:text-4xl leading-tight mb-4">{current.title}</h3>
        <p className="text-silver text-[15px] leading-relaxed">{current.body}</p>
        <div className="mt-7 flex gap-1.5">
          {pillars.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setActive(i)}
              className={`h-1 rounded-full transition-all ${i === active ? "w-10 bg-sun" : "w-3 bg-border-strong"}`}
              aria-label={`Ver ${p.label}`}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function TiltCard({
  x, y, active, onActivate, children,
}: {
  x: number; y: number; active: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ rx: -py * 12, ry: px * 12 });
  };
  const reset = () => setTilt({ rx: 0, ry: 0 });

  return (
    <button
      ref={ref}
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onMouseMove={onMove}
      onMouseLeave={reset}
      className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) perspective(600px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
      }}
    >
      <motion.div
        animate={{
          scale: active ? 1.1 : 1,
          borderColor: active ? "var(--sun)" : "var(--border-strong)",
        }}
        className="size-[84px] rounded-2xl bg-surface border-2 flex flex-col items-center justify-center shadow-[var(--shadow-soft)] px-2"
      >
        {children}
      </motion.div>
    </button>
  );
}
