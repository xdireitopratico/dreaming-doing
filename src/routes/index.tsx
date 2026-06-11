import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "@/components/landing/Hero";
import { Ticker } from "@/components/landing/Ticker";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Features } from "@/components/landing/Features";
import { Stats } from "@/components/landing/Stats";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { SpaceScene } from "@/components/space/SpaceScene";
import { Cursor } from "@/components/Cursor";
import { Nav } from "@/components/Nav";
import { useLenis } from "@/hooks/useLenis";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FORGE — Make Your Dream" },
      {
        name: "description",
        content:
          "FORGE é a plataforma de construção de apps web movida a IA. Descreva seu sonho — nós construímos.",
      },
      { property: "og:title", content: "FORGE — Make Your Dream" },
      {
        property: "og:description",
        content: "Da ideia ao deploy em segundos. Web app builder com IA de fronteira.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  useLenis();
  return (
    <div className="relative bg-background text-foreground">
      <SpaceScene />
      <div className="vignette" />
      <div className="grain-overlay" />
      <Cursor />
      <Nav />
      <main className="relative z-10">
        <Hero />
        <Ticker />
        <HowItWorks />
        <Features />
        <Stats />
        <FinalCTA />
        <footer className="relative z-10 border-t border-[var(--border)] py-10 px-6 text-center font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--text-ghost)]">
          FORGE · 2026 · BUILT IN ORBIT
        </footer>
      </main>
    </div>
  );
}
