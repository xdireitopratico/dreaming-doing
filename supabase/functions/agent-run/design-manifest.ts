// design-manifest.ts — Fonte de verdade do catálogo @forge/ui (gerado em CI).
import manifest from "./design_manifest.generated.json" with { type: "json" };

export type DesignManifest = typeof manifest;

export function loadDesignManifest(): DesignManifest {
  return manifest;
}

export function getCompositeExports(): string[] {
  return [...manifest.composite_exports];
}

export function getPhantomBanned(): string[] {
  return [...manifest.phantom_banned];
}

export function isExportValid(name: string): boolean {
  return (manifest.catalog_exports as string[]).includes(name);
}

export function isPhantomBanned(name: string): boolean {
  return (manifest.phantom_banned as string[]).includes(name);
}

/** Tier 0 — resumo compacto para system prompt (~6-8k chars). */
export function buildDesignManifestSummary(): string {
  const m = manifest;
  const lines: string[] = [
    "## @forge/ui — design manifest (fonte de verdade)",
    "Importe SOMENTE de `@forge/ui` (nunca paths profundos).",
    "",
    "### Composites básicos (9)",
    ...(m.compositions_basic as { export: string }[]).map((c) => `- ${c.export}`),
    "",
    "### Composições opinionated (11) — preferir para craft alto",
    ...(m.compositions_opinionated as { id: string; export: string; moment: string; techniques: string[] }[]).map(
      (c) => `- ${c.export} (${c.id}): ${c.moment} [${c.techniques.join(", ")}]`,
    ),
    "",
    "### Técnicas (12) — fs_read on-demand",
    ...(m.techniques as { id: string; name: string; concept: string }[]).map(
      (t) => `- ${t.name} (${t.id}): ${t.concept}`,
    ),
    "",
    "### DNA seeds (14 ids)",
    (m.dna_seeds as { id: string; name: string }[]).map((d) => d.id).join(", "),
    "",
    "### Linguagens visuais (12)",
    (m.visual_languages as { id: string; name: string }[]).map((v) => v.id).join(", "),
    "",
    "### Motion primitives",
    (m.motion_primitives as string[]).join(", "),
    "",
    "### PROIBIDO importar (phantom — não existe código)",
    (m.phantom_banned as string[]).join(", "),
  ];
  return lines.join("\n");
}