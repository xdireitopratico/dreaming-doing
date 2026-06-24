// design-plan-field.ts — Converte pacote resolve → DesignPlanField + persistência de assinatura.
import { resolveDesignPackage } from "./design-resolve.ts";
import type { DesignPlanField } from "./types.ts";

const WEB_UI_TEMPLATES = new Set([
  "vite-react",
  "nextjs-app-router",
  "tanstack-start",
  "expo",
  "astro",
  "node-api",
  "static-html",
  "custom",
]);

export function isWebUiTemplate(template: string): boolean {
  return WEB_UI_TEMPLATES.has(template);
}

export function packageToDesignPlanField(
  pkg: ReturnType<typeof resolveDesignPackage>,
): DesignPlanField {
  return {
    voice: pkg.proposal.voice,
    moment: pkg.proposal.moment,
    techniques: pkg.techniques,
    mood: pkg.proposal.mood,
    compositions: pkg.compositions,
    composition_exports: pkg.composition_exports,
    relevant_dnas: pkg.relevant_dnas,
    read_paths: pkg.read_paths,
    anti_patterns: pkg.anti_patterns,
    synthesis_reasoning: pkg.proposal.reasoning,
    research_queries: pkg.proposal.research_queries,
    dna_summaries: pkg.dna_summaries,
  };
}

export function autoResolveDesignField(input: {
  domain: string;
  projectTemplate: string;
  rotationKey?: string;
  excludeVoices?: string[];
  excludeTechniques?: string[];
  extractedDnaIds?: string[];
  sections?: string[];
}): DesignPlanField | undefined {
  if (!isWebUiTemplate(input.projectTemplate)) return undefined;
  const pkg = resolveDesignPackage({
    domain: input.domain.trim() || "produto digital",
    rotationKey: input.rotationKey,
    excludeVoices: input.excludeVoices,
    excludeTechniques: input.excludeTechniques,
    extractedDnaIds: input.extractedDnaIds,
    sections: input.sections,
  });
  return packageToDesignPlanField(pkg);
}

export type DesignSignatureRecord = {
  voice?: string[];
  mood?: string;
  techniques?: string[];
  moment?: string;
  compositions?: string[];
  updated_at?: string;
};

export function signatureFromDesignField(design: DesignPlanField): DesignSignatureRecord {
  return {
    voice: design.voice,
    mood: design.mood,
    techniques: design.techniques,
    moment: design.moment,
    compositions: design.compositions,
    updated_at: new Date().toISOString(),
  };
}

export function excludesFromSignature(sig: DesignSignatureRecord | null | undefined): {
  excludeVoices: string[];
  excludeTechniques: string[];
} {
  if (!sig || typeof sig !== "object") {
    return { excludeVoices: [], excludeTechniques: [] };
  }
  return {
    excludeVoices: Array.isArray(sig.voice) ? sig.voice.filter((v) => typeof v === "string") : [],
    excludeTechniques: Array.isArray(sig.techniques)
      ? sig.techniques.filter((t) => typeof t === "string")
      : [],
  };
}