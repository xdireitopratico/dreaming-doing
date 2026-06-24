// design-validate-signatures.ts — Assinaturas geradas do manifest (fonte única).
import { loadDesignManifest } from "./design-manifest.ts";

export type TechniqueSignature = { id: string; patterns: RegExp[] };
export type CompositionSignature = { id: string; exportName: string; pattern: RegExp };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Heroes opinionated exportados — anti-genérico. */
export function getOpinionatedHeroExports(): string[] {
  const m = loadDesignManifest();
  if (Array.isArray(m.opinionated_hero_exports)) {
    return [...(m.opinionated_hero_exports as string[])];
  }
  return (m.compositions_opinionated as { id: string; export: string }[])
    .filter((c) => c.id.startsWith("hero-") || c.export === "InteractiveHeroDemo")
    .map((c) => c.export);
}

export function buildCompositionSignatures(): CompositionSignature[] {
  const m = loadDesignManifest();
  const fromManifest = m.composition_signatures as
    | { id: string; export: string; pattern: string }[]
    | undefined;
  if (fromManifest?.length) {
    return fromManifest.map((c) => ({
      id: c.id,
      exportName: c.export,
      pattern: new RegExp(c.pattern),
    }));
  }
  return (m.compositions_opinionated as { id: string; export: string }[]).map((c) => ({
    id: c.id,
    exportName: c.export,
    pattern: new RegExp(escapeRegex(c.export)),
  }));
}

export function buildTechniqueSignatures(): TechniqueSignature[] {
  const m = loadDesignManifest();
  const fromManifest = m.technique_signatures as
    | { id: string; patterns: string[] }[]
    | undefined;
  if (fromManifest?.length) {
    return fromManifest.map((t) => ({
      id: t.id,
      patterns: t.patterns.map((p) => new RegExp(p, "i")),
    }));
  }
  return (m.techniques as { id: string; name: string }[]).map((t) => ({
    id: t.id,
    patterns: [new RegExp(escapeRegex(t.name), "i"), new RegExp(escapeRegex(t.id), "i")],
  }));
}

/** Regex combinada para detectar qualquer hero opinionated no código. */
export function opinionatedHeroPattern(): RegExp {
  const heroes = getOpinionatedHeroExports();
  if (heroes.length === 0) {
    return /HeroCinematic|HeroEditorial|HeroBrutalist|KineticHeadline|InteractiveHeroDemo/;
  }
  return new RegExp(heroes.map(escapeRegex).join("|"));
}