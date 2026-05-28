import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useAuth } from "@/lib/auth";
import { MarketingShell } from "@/components/MarketingShell";
import { AuroraBackdrop } from "@/components/cosmos/AuroraBackdrop";
import { CursorGlow } from "@/components/cosmos/CursorGlow";
import { HeroPromptBox } from "@/components/landing/HeroPromptBox";
import { Manifesto } from "@/components/landing/Manifesto";
import { PillarsDiagram } from "@/components/landing/PillarsDiagram";
import { LiveEditorDemo } from "@/components/landing/LiveEditorDemo";
import { ConnectorsPath } from "@/components/landing/ConnectorsPath";
import { PortfolioGrid } from "@/components/landing/PortfolioGrid";
import { PricingTeaser } from "@/components/landing/PricingTeaser";
import { FAQ } from "@/components/landing/FAQ";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: () => (
    <MarketingShell>
      <AuroraBackdrop />
      <CursorGlow />
      <Landing />
    </MarketingShell>
  ),
});

function Landing() {
  return (
    <>
      <Hero />
      <Manifesto />
      <LiveDemo />
      <Pillars />
      <ConnectorsPath />
      <Showcase />
      <PricingTeaser />
      <FAQSection />
      <FinalCTA />
    </>
  );
}

/* ─────────── HERO ─────────── */

function Hero() {
  return (
    <section className="relative px-6 pt-24 pb-24 md:pt-32 md:pb-36 overflow-hidden">
      <div className="relative mx-auto max-w-[920px] text-center">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface/40 backdrop-blur text-[11px] uppercase tracking-[0.20em] text-muted-foreground mb-10"
        >
          <span className="size-1.5 rounded-full bg-sun animate-pulse" />
          Beta aberta · feita no Brasil
        </motion.div>

        <h1 className="font-display text-[44px] leading-[1.02] sm:text-[72px] md:text-[104px] md:leading-[0.95] tracking-tight">
          <SplitLine delay={0}>Sonhe.</SplitLine>
          <SplitLine delay={0.12}>Descreva.</SplitLine>
          <SplitLine delay={0.24}>
            <span className="italic text-silver">Veja </span>
            <span className="relative inline-block">
              acontecer
              <svg
                aria-hidden
                className="absolute -bottom-3 left-0 w-full h-3"
                viewBox="0 0 200 12"
                fill="none"
                preserveAspectRatio="none"
              >
                <motion.path
                  d="M2 8 Q 60 2, 120 6 T 198 5"
                  stroke="var(--sun)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.4, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
                />
              </svg>
            </span>
            .
          </SplitLine>
        </h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.7 }}
          className="mt-10 text-[16px] md:text-[19px] text-silver max-w-[620px] mx-auto leading-relaxed"
        >
          Um estúdio de software que cabe num prompt — e que continua{" "}
          <span className="text-foreground">seu</span> pra sempre.
        </motion.p>

        <HeroPromptBox />

        {/* Marquee de stack */}
        <div className="mt-20 overflow-hidden mask-fade">
          <div className="dw-marquee dw-marquee-pause flex gap-12 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground/70">
            {[...STACK, ...STACK].map((s, i) => (
              <span key={i} className="inline-flex items-center gap-12">
                {s}
                <span className="size-1 rounded-full bg-border-strong" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const STACK = [
  "Supabase",
  "GitHub",
  "Anthropic",
  "OpenAI",
  "Groq",
  "Google Gemini",
  "Cloudflare",
  "Vercel",
  "MCP",
  "n8n",
  "Notion",
  "Linear",
];

function SplitLine({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
      className="block"
    >
      {children}
    </motion.span>
  );
}

/* ─────────── DEMO VIVA ─────────── */

function LiveDemo() {
  return (
    <section className="relative px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1120px]">
        <div className="text-[11px] uppercase tracking-[0.24em] text-sun mb-6">Em funcionamento</div>
        <h2 className="font-display text-4xl md:text-6xl leading-[1.05] max-w-3xl mb-5">
          Não é mockup. É o editor real, <span className="text-silver">tocando em loop.</span>
        </h2>
        <p className="text-silver text-[15px] md:text-[17px] max-w-[58ch] mb-14 leading-relaxed">
          Veja cada decisão da IA acontecer: tool-calls streamados, arquivos sendo criados,
          preview ao vivo. Tudo o que você vai usar quando entrar no editor de verdade.
        </p>
        <LiveEditorDemo />
      </div>
    </section>
  );
}

/* ─────────── PILARES ─────────── */

function Pillars() {
  return (
    <section id="pilares" className="relative px-6 py-28 md:py-40">
      <div className="mx-auto max-w-[1120px]">
        <div className="text-[11px] uppercase tracking-[0.24em] text-sun mb-6">Quatro promessas</div>
        <h2 className="font-display text-4xl md:text-6xl leading-[1.05] max-w-3xl mb-16">
          O que você ganha quando<br />
          o construtor é <span className="text-silver">seu de verdade.</span>
        </h2>
        <PillarsDiagram />
      </div>
    </section>
  );
}

/* ─────────── VITRINE ─────────── */

function Showcase() {
  return (
    <section id="vitrine" className="relative px-6 py-28 md:py-40">
      <div className="mx-auto max-w-[1120px]">
        <div className="flex items-end justify-between mb-14 gap-6 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-sun mb-6">Construído aqui</div>
            <h2 className="font-display text-4xl md:text-6xl leading-[1.05] max-w-2xl">
              Projetos reais, <span className="text-silver">em poucas horas.</span>
            </h2>
          </div>
          <div className="text-[13px] text-muted-foreground max-w-[300px]">
            Cada um vem com o prompt original, o tempo total de construção e o código aberto.
          </div>
        </div>
        <PortfolioGrid />
      </div>
    </section>
  );
}

/* ─────────── FAQ ─────────── */

function FAQSection() {
  return (
    <section id="faq" className="relative px-6 py-28 md:py-40">
      <div className="mx-auto max-w-[820px]">
        <div className="text-[11px] uppercase tracking-[0.24em] text-sun mb-6">Perguntas frequentes</div>
        <h2 className="font-display text-4xl md:text-6xl leading-tight mb-10">
          As coisas que <span className="text-silver">importam.</span>
        </h2>
        <FAQ />
      </div>
    </section>
  );
}

/* ─────────── CTA FINAL ─────────── */

function FinalCTA() {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <section className="relative px-6 py-32 md:py-44 overflow-hidden">
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: "var(--gradient-sun)" }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 10, repeat: Infinity }}
      />
      <div className="relative mx-auto max-w-[760px] text-center">
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7 }}
          className="font-display text-[44px] md:text-[80px] leading-[1.02]"
        >
          O próximo software<br />
          que você ama <span className="italic text-silver">vai ser seu.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-silver text-[16px] mt-8 mb-10 max-w-[480px] mx-auto"
        >
          Entre na beta. Construa algo pequeno hoje à noite. Conte pra gente como foi.
        </motion.p>
        <Button
          size="lg"
          className="dw-pulse-glow text-base"
          onClick={() => navigate({ to: user ? "/projects" : "/auth", search: { next: "/" } as any })}
        >
          {user ? "Ir para meus projetos" : "Começar a criar"}
        </Button>
      </div>
    </section>
  );
}
