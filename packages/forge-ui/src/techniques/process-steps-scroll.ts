import type { Technique } from "./types";

export const PROCESS_STEPS_SCROLL: Technique = {
  id: "process-steps-scroll",
  name: "ProcessStepsScroll",
  concept: "How-it-works com steps numerados revelados no scroll — narrativa sequencial, não grid estático.",
  whenToUse: "Onboarding, fluxos em 3-5 passos, produtos que precisam explicar 'como funciona'.",
  pairsWith: ["scroll-reveal", "sticky-stack", "count-up-metrics"],
  primitives: ["Reveal", "StaggerContainer", "StaggerItem"],
  reference: `import { Reveal, StaggerContainer, StaggerItem } from "@forge/ui";

export function ProcessSteps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <StaggerContainer className="space-y-16">
      {steps.map((s, i) => (
        <StaggerItem key={s.title}>
          <Reveal direction="up" delay={i * 0.08}>
            <div className="flex gap-6">
              <span className="font-display text-4xl font-bold text-brand-500 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="font-display text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.body}</p>
              </div>
            </div>
          </Reveal>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}`,
};