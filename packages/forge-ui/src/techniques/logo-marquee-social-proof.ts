import type { Technique } from "./types";

export const LOGO_MARQUEE_SOCIAL_PROOF: Technique = {
  id: "logo-marquee-social-proof",
  name: "LogoMarqueeSocialProof",
  concept: "Faixa dupla de logos/clientes com marquee infinito — densidade de prova social sem carousel pesado.",
  whenToUse: "B2B SaaS, agências, qualquer landing que precise 'empresas que confiam'. 8-16 logos.",
  pairsWith: ["infinite-marquee", "count-up-metrics", "scroll-reveal"],
  primitives: ["Marquee"],
  reference: `import { Marquee } from "@forge/ui";

export function LogoMarqueeSocialProof({ logos }: { logos: string[] }) {
  return (
    <section className="border-y border-border bg-surface-1/40 py-10">
      <p className="mb-6 text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Confiam na plataforma
      </p>
      <Marquee speed={50} className="opacity-80">
        {logos.map((logo) => (
          <span key={logo} className="mx-8 font-display text-xl font-semibold text-muted-foreground">
            {logo}
          </span>
        ))}
      </Marquee>
    </section>
  );
}`,
};