import { motion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { Database, Github, Brain, Cloud, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Node = {
  id: string;
  icon: typeof Database;
  label: string;
  short: string;
  steps: { title: string; body: string }[];
  link?: { label: string; href: string };
};

const NODES: Node[] = [
  {
    id: "supabase",
    icon: Database,
    label: "Banco de dados",
    short: "Supabase",
    steps: [
      { title: "1. Criar conta", body: "Acesse supabase.com e crie sua conta grátis em 60 segundos." },
      { title: "2. Criar projeto", body: "Crie um novo projeto. Escolha a região mais perto de você." },
      { title: "3. Copiar URL e anon key", body: "Em Settings → API, copie a Project URL e a anon public key." },
      { title: "4. Colar na página de Conectores", body: "Volta aqui e cola. A gente cuida da migração de schema, RLS, tudo." },
    ],
    link: { label: "Abrir supabase.com", href: "https://supabase.com" },
  },
  {
    id: "github",
    icon: Github,
    label: "Versionamento",
    short: "GitHub",
    steps: [
      { title: "1. Conectar conta", body: "Um clique em Conectar GitHub abre o OAuth oficial — não pedimos sua senha." },
      { title: "2. Escolher repositório", body: "Crie um repo novo ou aponte para um existente. Privado ou público, você decide." },
      { title: "3. Sincronização bidirecional", body: "Cada mudança do agente vira commit. Edite fora daqui e o editor reflete." },
    ],
    link: { label: "github.com", href: "https://github.com" },
  },
  {
    id: "llm",
    icon: Brain,
    label: "Inteligência",
    short: "LLM (sua chave)",
    steps: [
      { title: "Anthropic", body: "console.anthropic.com → API Keys → Create Key. Cola aqui em Conectores." },
      { title: "OpenAI", body: "platform.openai.com → API keys → Create new secret key." },
      { title: "Groq (rápido e barato)", body: "console.groq.com → API Keys. Modelo Llama 3.1 grátis no tier inicial." },
      { title: "Gemini do Google", body: "aistudio.google.com → Get API key. Tier gratuito generoso." },
    ],
  },
  {
    id: "deploy",
    icon: Cloud,
    label: "Deploy",
    short: "Vercel · Cloudflare",
    steps: [
      { title: "1. Escolher plataforma", body: "Vercel, Cloudflare Pages ou Netlify — todas suportadas nativamente." },
      { title: "2. Apontar para o repo", body: "Como o código já está no seu GitHub, é dois cliques pra plugar." },
      { title: "3. Auto-deploy", body: "Cada commit que o agente faz vira deploy. Você acompanha tudo em tempo real." },
    ],
  },
];

export function ConnectorsPath() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.5"],
  });
  const pathLen = useTransform(scrollYProgress, [0, 1], [0, 1]);

  const [open, setOpen] = useState<Node | null>(null);

  return (
    <section id="conectores" className="relative px-6 py-28 md:py-40">
      <div ref={ref} className="mx-auto max-w-[1120px]">
        <div className="text-[11px] uppercase tracking-[0.24em] text-sun mb-6">Conectores</div>
        <h2 className="font-display text-4xl md:text-6xl leading-[1.05] max-w-3xl mb-6">
          Sua stack. <span className="text-silver">Sua chave.</span> Seu controle.
        </h2>
        <p className="text-silver text-[16px] max-w-[60ch] leading-relaxed mb-16">
          Aqui ninguém te prende. Conecte o que você já usa — ou aprenda agora,
          passo a passo, em português. Cada nó abaixo ensina como criar a conta
          e onde tirar a chave.
        </p>

        {/* Trilha desktop */}
        <div className="relative hidden md:block">
          <svg
            aria-hidden
            className="absolute top-[44px] left-0 w-full h-[2px]"
            viewBox="0 0 1000 2"
            preserveAspectRatio="none"
          >
            <line x1="0" y1="1" x2="1000" y2="1" stroke="var(--border-strong)" strokeDasharray="4 6" />
            <motion.line
              x1="0" y1="1" x2="1000" y2="1"
              stroke="var(--sun)"
              strokeWidth="2"
              style={{ pathLength: pathLen }}
            />
          </svg>

          <div className="relative grid grid-cols-4 gap-6">
            {NODES.map((n, i) => {
              const Icon = n.icon;
              return (
                <motion.button
                  key={n.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  onClick={() => setOpen(n)}
                  className="group text-left rounded-2xl border border-border bg-surface/60 backdrop-blur-xl p-6 hover:border-sun/40 hover:bg-surface transition-all dw-starlight"
                >
                  <div className="size-[88px] mx-auto mb-5 rounded-2xl bg-background border border-border-strong grid place-items-center shadow-[var(--shadow-soft)] group-hover:border-sun/60 transition-colors">
                    <Icon className="size-9 text-silver group-hover:text-sun transition-colors" />
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5 text-center">
                    {n.label}
                  </div>
                  <div className="font-display text-xl text-center mb-3">{n.short}</div>
                  <div className="text-[12px] text-muted-foreground text-center group-hover:text-foreground/80 transition-colors">
                    Como conectar →
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Trilha mobile — vertical */}
        <div className="md:hidden space-y-3">
          {NODES.map((n) => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                onClick={() => setOpen(n)}
                className="w-full text-left rounded-2xl border border-border bg-surface/60 backdrop-blur p-4 flex items-center gap-4"
              >
                <div className="size-12 rounded-xl bg-background border border-border-strong grid place-items-center shrink-0">
                  <Icon className="size-5 text-silver" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-0.5">{n.label}</div>
                  <div className="font-display text-lg">{n.short}</div>
                </div>
                <div className="text-[11px] text-sun">Ver →</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Drawer / modal */}
      {open && <ConnectorModal node={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function ConnectorModal({ node, onClose }: { node: Node; onClose: () => void }) {
  const Icon = node.icon;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-background/80 backdrop-blur-lg"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-2xl border border-border-strong bg-surface shadow-[var(--shadow-glow)] p-8"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 size-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
          aria-label="Fechar"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="size-10 rounded-xl bg-background border border-border-strong grid place-items-center">
            <Icon className="size-5 text-sun" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{node.label}</div>
            <div className="font-display text-2xl">{node.short}</div>
          </div>
        </div>

        <ol className="mt-6 space-y-4">
          {node.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="size-6 shrink-0 rounded-full bg-sun/15 text-sun font-mono text-xs grid place-items-center mt-0.5">
                {i + 1}
              </span>
              <div>
                <div className="font-medium text-[14px]">{s.title}</div>
                <div className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>

        {node.link && (
          <Button asChild variant="outline" size="sm" className="mt-6 gap-1.5">
            <a href={node.link.href} target="_blank" rel="noreferrer">
              {node.link.label} <ExternalLink className="size-3.5" />
            </a>
          </Button>
        )}
      </motion.div>
    </motion.div>
  );
}
