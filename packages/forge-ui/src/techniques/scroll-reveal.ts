import type { Technique } from "./types";

/**
 * ScrollReveal — coreografia de revelação. Não é "animar um elemento", é
 * orquestrar uma SEQUÊNCIA de revelações com delays escalonados pra criar
 * ritmo narrativo ao rolar. É a base do "scroll storytelling".
 */
export const SCROLL_REVEAL: Technique = {
  id: "scroll-reveal",
  name: "ScrollReveal",
  concept: "Revelação escalonada ao entrar no viewport — elementos surgem em sequência com ritmo, não todos de uma vez.",
  whenToUse: "Toda seção que merece impacto: hero, features, pricing. Combina com praticamente tudo.",
  pairsWith: ["sticky-stack", "parallax-depth", "kinetic-typography"],
  primitives: ["Reveal", "StaggerContainer", "StaggerItem"],
  reference: `import { Reveal, StaggerContainer, StaggerItem } from "@forge/ui";

// Coreografe a entrada: o container escalaia o stagger, cada item herda o delay.
export function FeatureGrid({ items }: { items: { title: string; body: string }[] }) {
  return (
    <StaggerContainer className="grid gap-6 md:grid-cols-3" staggerChildren={0.12}>
      {items.map((it) => (
        <StaggerItem key={it.title}>
          <Reveal direction="up" distance={28}>
            <div className="rounded-2xl border border-border bg-surface-2 p-6">
              <h3 className="font-display text-xl font-semibold mb-2">{it.title}</h3>
              <p className="text-muted-foreground">{it.body}</p>
            </div>
          </Reveal>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}

// Adapte: mude direction/distance por seção, quebre o ritmo com um item que
// vem de lado (direction: "left"). Ritmo > uniformidade.`,
};
