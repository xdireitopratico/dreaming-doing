import type { Technique } from "./types";

export const SECTION_TABS_VISUAL: Technique = {
  id: "section-tabs-visual",
  name: "SectionTabsVisual",
  concept: "Abas com preview visual — cada lane mostra screenshot/diagrama ao trocar (Voice/Video/Robotics).",
  whenToUse: "Produtos multi-modalidade, plataformas com 3+ capacidades distintas. Máx 4 tabs.",
  pairsWith: ["scroll-reveal", "spotlight-cursor", "magnetic-interaction"],
  primitives: ["Tabs", "Reveal"],
  reference: `import { Tabs, TabsContent, TabsList, TabsTrigger } from "@forge/ui";
import { Reveal } from "@forge/ui";

export function FeatureTabs({ lanes }: { lanes: { id: string; label: string; visual: React.ReactNode; copy: string }[] }) {
  return (
    <Tabs defaultValue={lanes[0]?.id} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        {lanes.map((l) => (
          <TabsTrigger key={l.id} value={l.id}>{l.label}</TabsTrigger>
        ))}
      </TabsList>
      {lanes.map((l) => (
        <TabsContent key={l.id} value={l.id} className="mt-8">
          <Reveal direction="up">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
              <div className="rounded-2xl border border-border bg-surface-1 p-2">{l.visual}</div>
              <p className="text-lg text-muted-foreground">{l.copy}</p>
            </div>
          </Reveal>
        </TabsContent>
      ))}
    </Tabs>
  );
}`,
};