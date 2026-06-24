import type { Technique } from "./types";

export const INTERACTIVE_DEMO_EMBED: Technique = {
  id: "interactive-demo-embed",
  name: "InteractiveDemoEmbed",
  concept: "Demo embutido no hero — iframe, player ou widget interativo como prova imediata do produto.",
  whenToUse: "SaaS com UI visual, APIs com playground, produtos que vendem pela experiência, não só copy.",
  pairsWith: ["spotlight-cursor", "scroll-reveal", "parallax-depth"],
  primitives: ["Button", "Badge"],
  reference: `export function HeroWithDemo({ title, demo }: { title: string; demo: React.ReactNode }) {
  return (
    <section className="grid gap-12 lg:grid-cols-2 lg:items-center">
      <h1 className="font-display text-5xl font-semibold">{title}</h1>
      <div className="rounded-2xl border border-border bg-surface-1 p-2 shadow-glow">
        <div className="aspect-video overflow-hidden rounded-xl">{demo}</div>
      </div>
    </section>
  );
}`,
};