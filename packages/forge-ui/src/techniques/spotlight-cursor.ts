import type { Technique } from "./types";

/**
 * SpotlightCursor — gradiente radial segue o cursor. Em grids de cards e
 * showcases, cria a sensação de "lâmpada movendo-se sobre os produtos".
 * Sutil, premium, excelente em superfícies escuras.
 */
export const SPOTLIGHT_CURSOR: Technique = {
  id: "spotlight-cursor",
  name: "SpotlightCursor",
  concept: "Gradiente radial segue o cursor iluminando cards/elementos — sensação de lanterna sobre produtos numa vitrine.",
  whenToUse: "Grids de features/cards, showcases de produto, galerias. Excelente em superfícies escuras (moods dark).",
  pairsWith: ["tilt-hover", "magnetic-interaction", "glassmorphism-layers"],
  primitives: ["Spotlight"],
  reference: `import { Spotlight } from "@forge/ui";

// Cada card tem seu próprio spotlight. O gradiente aparece só onde o cursor
// está dentro daquele card.
export function SpotlightGrid({
  items,
}: {
  items: { title: string; body: string }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((it) => (
        <Spotlight
          key={it.title}
          size={280}
          className="rounded-2xl border border-border bg-surface-1 p-6 transition-colors hover:border-brand-500/40"
        >
          <h3 className="font-display text-lg font-semibold">{it.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{it.body}</p>
        </Spotlight>
      ))}
    </div>
  );
}`,
};
