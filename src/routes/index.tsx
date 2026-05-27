import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { MarketingShell } from "@/components/MarketingShell";
import { PillarsDiagram } from "@/components/landing/PillarsDiagram";
import { LiveEditorDemo } from "@/components/landing/LiveEditorDemo";
import { PortfolioGrid } from "@/components/landing/PortfolioGrid";
import { FAQ } from "@/components/landing/FAQ";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

const PENDING_KEY = "dw-pending-prompt";

export const Route = createFileRoute("/")({
  component: () => (
    <MarketingShell>
      <Landing />
    </MarketingShell>
  ),
});

const STACK = [
  "Supabase",
  "TanStack Start",
  "React 19",
  "WebContainers",
  "Google Gemini",
  "Anthropic Claude",
  "MCP",
  "GitHub",
  "Cloudflare",
  "Vite",
];

function Landing() {
  return (
    <>
      <Hero />
      <Manifesto />
      <Pillars />
      <LiveDemo />
      <Showcase />
      <HowItWorks />
      <Numbers />
      <FAQSection />
      <FinalCTA />
    </>
  );
}

/* ─────────── HERO ─────────── */

function Hero() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  // Retomar prompt salvo após login
  useEffect(() => {
    if (typeof window === "undefined") return;
    const pending = localStorage.getItem(PENDING_KEY);
    if (pending && user) {
      setPrompt(pending);
      localStorage.removeItem(PENDING_KEY);
      // dispara automaticamente em pequeno delay para feedback visual
      setTimeout(() => submitWith(pending), 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const submitWith = async (text: string) => {
    if (!text.trim()) return;
    if (!user) {
      try {
        localStorage.setItem(PENDING_KEY, text);
      } catch {}
      navigate({ to: "/auth", search: { next: "/" } as any });
      return;
    }
    setBusy(true);
    try {
      const name = text.split("\n")[0].slice(0, 60) || "Novo projeto";
      const slug = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: project, error: pErr } = await supabase
        .from("projects")
        .insert({ owner_id: user.id, name, slug, description: text.slice(0, 280) })
        .select()
        .single();
      if (pErr || !project) throw pErr ?? new Error("Falha ao criar projeto");

      const { data: conv, error: cErr } = await supabase
        .from("conversations")
        .insert({ project_id: project.id, title: name })
        .select()
        .single();
      if (cErr || !conv) throw cErr ?? new Error("Falha ao criar conversa");

      await supabase.from("messages").insert({
        conversation_id: conv.id,
        role: "user",
        parts: [{ type: "text", text }],
      });

      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar projeto");
      setBusy(false);
    }
  };

  return (
    <section className="relative px-6 pt-20 pb-24 md:pt-28 md:pb-32 overflow-hidden">
      {/* glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-hero)" }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mx-auto max-w-[920px] text-center">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface/40 backdrop-blur text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-8"
        >
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          Beta privada · convide-se
        </motion.div>

        <h1 className="font-display text-[44px] leading-[1.05] sm:text-[64px] md:text-[84px] md:leading-[0.98] tracking-tight">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="block"
          >
            Construa software como
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="block"
          >
            você <em className="italic text-primary">pensa</em>. Sem pedir
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="block"
          >
            <span className="relative inline-block">
              licença
              <svg
                className="absolute -bottom-2 left-0 w-full"
                viewBox="0 0 200 12"
                fill="none"
                preserveAspectRatio="none"
              >
                <motion.path
                  d="M2 8 Q 60 2, 120 6 T 198 5"
                  stroke="var(--primary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.2, delay: 0.9, ease: "easeInOut" }}
                />
              </svg>
            </span>{" "}
            pra ninguém.
          </motion.span>
        </h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="mt-8 text-[16px] md:text-[18px] text-muted-foreground max-w-[640px] mx-auto leading-relaxed"
        >
          O primeiro construtor por IA em que o código, o banco e a infra continuam{" "}
          <span className="text-foreground">seus</span> desde o primeiro prompt.
        </motion.p>

        {/* Prompt protagonista */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-12 max-w-[680px] mx-auto"
        >
          <div className="rounded-2xl border border-border-strong bg-surface/70 backdrop-blur shadow-[var(--shadow-soft)] p-2 focus-within:border-primary/60 transition-colors">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitWith(prompt);
              }}
              placeholder="Descreva o que você quer construir…"
              className="min-h-[96px] border-0 focus-visible:ring-0 resize-none text-[15px] shadow-none bg-transparent placeholder:text-muted-foreground/70"
            />
            <div className="flex items-center justify-between p-2">
              <div className="font-mono text-[11px] text-muted-foreground">⌘+Enter para enviar · sem cadastro pra testar</div>
              <Button onClick={() => submitWith(prompt)} disabled={!prompt.trim() || busy} size="sm" className="gap-1.5">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                Construir
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Stack marquee */}
        <div className="mt-16 overflow-hidden mask-fade">
          <div className="dw-marquee dw-marquee-pause flex gap-10 whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.22em] text-muted-foreground/70">
            {[...STACK, ...STACK].map((s, i) => (
              <span key={i} className="inline-flex items-center gap-10">
                {s}
                <span className="size-1 rounded-full bg-border-strong" />
              </span>
            ))}
          </div>
        </div>
      </div>

      <style>{`.mask-fade{mask-image:linear-gradient(to right,transparent,black 12%,black 88%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,black 12%,black 88%,transparent);}`}</style>
    </section>
  );
}

/* ─────────── MANIFESTO ─────────── */

function Manifesto() {
  const cards = [
    {
      n: "001",
      title: "Seu código mora num inquilino.",
      body: "Se eles fecham, somem com seu app. Se mudam o preço, você paga. Se mudam o modelo, sua build quebra na sexta à noite.",
    },
    {
      n: "002",
      title: "Sua chave é deles.",
      body: "Você não vê o que o agente faz. Não vê quanto custa cada interação. Não tem como auditar. Confie e reze.",
    },
    {
      n: "003",
      title: "Você está preso ao stack deles.",
      body: "Sem MCP. Sem o seu Supabase. Sem as suas ferramentas internas. Só o que eles permitirem — e quando permitirem.",
    },
  ];

  return (
    <section id="manifesto" className="relative px-6 py-24 md:py-32 border-t border-border bg-surface/30">
      <div className="mx-auto max-w-[1120px]">
        <div className="text-[11px] uppercase tracking-[0.22em] text-primary mb-4">O problema</div>
        <h2 className="font-display text-4xl md:text-5xl leading-tight max-w-3xl mb-16">
          Você não é dono do seu construtor de IA.
          <br />
          E está sendo cobrado pra fingir que é.
        </h2>

        <div className="grid md:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden border border-border">
          {cards.map((c, i) => (
            <motion.div
              key={c.n}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="bg-background p-8 md:p-10"
            >
              <div className="font-mono text-xs text-primary mb-6">{c.n}</div>
              <h3 className="font-display text-2xl leading-snug mb-3">{c.title}</h3>
              <p className="text-muted-foreground text-[14px] leading-relaxed">{c.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────── PILARES ─────────── */

function Pillars() {
  return (
    <section id="pilares" className="relative px-6 py-24 md:py-32 border-t border-border">
      <div className="mx-auto max-w-[1120px]">
        <div className="text-[11px] uppercase tracking-[0.22em] text-primary mb-4">A resposta</div>
        <h2 className="font-display text-4xl md:text-5xl leading-tight max-w-3xl mb-16">
          Quatro princípios. Nenhum negociável.
        </h2>
        <PillarsDiagram />
      </div>
    </section>
  );
}

/* ─────────── DEMO VIVA ─────────── */

function LiveDemo() {
  return (
    <section className="relative px-6 py-24 md:py-32 border-t border-border bg-surface/30">
      <div className="mx-auto max-w-[1120px]">
        <div className="text-[11px] uppercase tracking-[0.22em] text-primary mb-4">Em funcionamento</div>
        <h2 className="font-display text-4xl md:text-5xl leading-tight max-w-3xl mb-4">
          Não é mockup. É o editor real, tocando em loop.
        </h2>
        <p className="text-muted-foreground text-[15px] max-w-2xl mb-12">
          Veja cada decisão da IA acontecer: tool-calls streamados, arquivos sendo criados, preview ao vivo. Tudo o que
          você vai usar quando entrar no editor de verdade.
        </p>
        <LiveEditorDemo />
      </div>
    </section>
  );
}

/* ─────────── VITRINE ─────────── */

function Showcase() {
  return (
    <section id="vitrine" className="relative px-6 py-24 md:py-32 border-t border-border">
      <div className="mx-auto max-w-[1120px]">
        <div className="flex items-end justify-between mb-12 gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-primary mb-4">Vitrine</div>
            <h2 className="font-display text-4xl md:text-5xl leading-tight max-w-2xl">
              Construído com Dream Weaver,
              <br /> em poucas horas.
            </h2>
          </div>
          <div className="text-xs text-muted-foreground hidden md:block max-w-[280px] text-right">
            Exemplos curados pela equipe. Cada projeto inclui prompt original, tempo total e código aberto.
          </div>
        </div>
        <PortfolioGrid />
      </div>
    </section>
  );
}

/* ─────────── COMO FUNCIONA ─────────── */

function HowItWorks() {
  const steps = [
    { n: "Descreva", body: "Uma frase. Em português. O agente entende o contexto, faz perguntas se precisar, propõe a arquitetura." },
    { n: "Veja construir", body: "Cada arquivo, cada decisão, em stream. Você intervém quando quiser, redireciona o curso, pede para refazer." },
    { n: "Publique", body: "No seu domínio, no seu GitHub, no seu Cloudflare. A gente sai do caminho — o projeto é seu." },
  ];
  return (
    <section className="relative px-6 py-24 md:py-32 border-t border-border bg-surface/30">
      <div className="mx-auto max-w-[1120px]">
        <div className="text-[11px] uppercase tracking-[0.22em] text-primary mb-4">Como funciona</div>
        <h2 className="font-display text-4xl md:text-5xl leading-tight max-w-2xl mb-16">
          Três passos. Sem mistério.
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
            >
              <div className="font-mono text-xs text-muted-foreground mb-3">PASSO {i + 1}</div>
              <div className="font-display text-3xl mb-3">{s.n}</div>
              <p className="text-muted-foreground text-[14px] leading-relaxed">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────── NÚMEROS / PROVA ─────────── */

function Numbers() {
  return (
    <section className="relative px-6 py-24 border-t border-border">
      <div className="mx-auto max-w-[1120px]">
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {[
            { k: "Beta privada", v: "120", sub: "convites por semana" },
            { k: "Licença", v: "MIT", sub: "agente é código aberto" },
            { k: "Lock-in", v: "0%", sub: "exporte e suma quando quiser" },
          ].map((it) => (
            <div key={it.k} className="border-l-2 border-primary pl-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">{it.k}</div>
              <div className="font-display text-5xl mb-1">{it.v}</div>
              <div className="text-sm text-muted-foreground">{it.sub}</div>
            </div>
          ))}
        </div>

        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-4">Compatível com</div>
        <div className="overflow-hidden mask-fade">
          <div className="dw-marquee-slow flex gap-12 whitespace-nowrap font-mono text-[13px] text-muted-foreground/80">
            {[...["Supabase", "GitHub", "Cloudflare", "Vercel", "Notion MCP", "Linear MCP", "Anthropic", "OpenAI", "Google Gemini", "Stripe"], ...["Supabase", "GitHub", "Cloudflare", "Vercel", "Notion MCP", "Linear MCP", "Anthropic", "OpenAI", "Google Gemini", "Stripe"]].map((n, i) => (
              <span key={i} className="inline-flex items-center gap-12">
                {n}
                <span className="size-1 rounded-full bg-border-strong" />
              </span>
            ))}
          </div>
        </div>
        <style>{`.mask-fade{mask-image:linear-gradient(to right,transparent,black 12%,black 88%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,black 12%,black 88%,transparent);}`}</style>
      </div>
    </section>
  );
}

/* ─────────── FAQ ─────────── */

function FAQSection() {
  return (
    <section id="faq" className="relative px-6 py-24 md:py-32 border-t border-border bg-surface/30">
      <div className="mx-auto max-w-[820px]">
        <div className="text-[11px] uppercase tracking-[0.22em] text-primary mb-4">Perguntas frequentes</div>
        <h2 className="font-display text-4xl md:text-5xl leading-tight mb-10">As coisas que importam.</h2>
        <FAQ />
      </div>
    </section>
  );
}

/* ─────────── CTA FINAL ─────────── */

function FinalCTA() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");

  const go = () => {
    if (!prompt.trim()) {
      navigate({ to: "/auth", search: { next: "/" } as any });
      return;
    }
    try {
      localStorage.setItem(PENDING_KEY, prompt);
    } catch {}
    if (user) {
      // dispara fluxo do hero recarregando home
      window.location.href = "/";
    } else {
      navigate({ to: "/auth", search: { next: "/" } as any });
    }
  };

  return (
    <section className="relative px-6 py-32 border-t border-border overflow-hidden">
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: "var(--gradient-hero)" }}
        animate={{ opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 10, repeat: Infinity }}
      />
      <div className="relative mx-auto max-w-[720px] text-center">
        <h2 className="font-display text-4xl md:text-6xl leading-tight mb-6">
          Pare de pedir <em className="italic text-primary">licença</em> pra construir.
        </h2>
        <p className="text-muted-foreground text-[16px] mb-10 max-w-[480px] mx-auto">
          Descreva sua próxima ideia. A gente cuida do resto — sem amarras.
        </p>
        <div className="rounded-2xl border border-border-strong bg-surface/80 backdrop-blur shadow-[var(--shadow-soft)] p-2 text-left">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Crie um app de…"
            className="min-h-[80px] border-0 focus-visible:ring-0 resize-none text-[15px] shadow-none bg-transparent placeholder:text-muted-foreground/70"
          />
          <div className="flex items-center justify-between p-2">
            <div className="font-mono text-[11px] text-muted-foreground">grátis na beta</div>
            <Button onClick={go} size="sm" className="gap-1.5">
              <Plus className="size-4" /> Começar agora
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
