// design-resolve.ts — Síntese determinística de design (zero LLM) para agent-run.
import { reviewSynthesisFull } from "./design-critic-edge.ts";
import { loadDesignManifest } from "./design-manifest.ts";
import { hashRotation, synthesizeCore } from "./design-synthesis.ts";
import type { DesignReference } from "./types.ts";

/** IDs de DNA seeds válidos a partir de referências (extract_design_dna → extracted_dna). */
export function dnaIdsFromReferences(references?: DesignReference[]): string[] {
  if (!references?.length) return [];
  const valid = new Set(
    (loadDesignManifest().dna_seeds as { id: string }[]).map((d) => d.id),
  );
  const out: string[] = [];
  for (const ref of references) {
    const raw = ref.extracted_dna?.trim();
    if (!raw) continue;
    if (valid.has(raw)) {
      out.push(raw);
      continue;
    }
    for (const id of valid) {
      if (raw.includes(id)) out.push(id);
    }
  }
  return [...new Set(out)];
}

export type DesignResolveInput = {
  domain: string;
  sections?: string[];
  moodOverride?: string;
  excludeVoices?: string[];
  excludeTechniques?: string[];
  /** Anti-repetição entre projetos do mesmo workspace. */
  rotationKey?: string;
  /** DNA extraído do usuário (extract_design_dna) — merge prioritário. */
  extractedDnaIds?: string[];
};

export type SynthesisProposal = {
  voice: string[];
  reasoning: string;
  moment: string;
  techniques: string[];
  relevant_dnas: string[];
  mood: string;
  anti_patterns: string[];
  confidence: number;
  research_queries?: string[];
};

export type CriticResult = {
  pass: boolean;
  warnings: string[];
  blocks: string[];
  suggestions?: string[];
};

export type DesignResolvePackage = {
  proposal: SynthesisProposal;
  compositions: string[];
  composition_exports: string[];
  techniques: string[];
  relevant_dnas: string[];
  read_paths: string[];
  anti_patterns: string[];
  critic: CriticResult;
  summary: string;
  dna_summaries?: Record<string, string>;
};

type OpinionatedRow = {
  id: string;
  export: string;
  moment: string;
  voice: string[];
  techniques: string[];
  compatible_moods: string[];
  sandbox_read_path: string;
};

function scoreComposition(
  comp: OpinionatedRow,
  voice: string[],
  mood: string,
  rotation: number,
  sectionBoost: Set<string>,
): number {
  let score = 0;
  for (const v of voice) if (comp.voice.includes(v)) score += 3;
  if (comp.compatible_moods.includes(mood)) score += 2;
  if (sectionBoost.has(comp.id)) score += 5;
  score += (hashRotation(comp.id + String(rotation)) % 5) * 0.1;
  return score;
}

function sectionBoostIds(sections?: string[]): Set<string> {
  const m = loadDesignManifest();
  const map = (m.section_composition_map ?? {}) as Record<string, string[]>;
  const boost = new Set<string>();
  for (const section of sections ?? []) {
    const key = section.toLowerCase().trim();
    for (const id of map[key] ?? []) boost.add(id);
  }
  return boost;
}

function pickCompositions(
  opinionated: OpinionatedRow[],
  voice: string[],
  mood: string,
  rotation: number,
  sections?: string[],
  excludeIds: string[] = [],
): [OpinionatedRow, OpinionatedRow] {
  const boost = sectionBoostIds(sections);
  const ranked = [...opinionated]
    .filter((c) => !excludeIds.includes(c.id))
    .map((c) => ({ c, score: scoreComposition(c, voice, mood, rotation, boost) }))
    .sort((a, b) => b.score - a.score);

  const primary = ranked[0]?.c ?? opinionated[0];
  const secondary = ranked.find((r) => r.c.id !== primary.id)?.c ?? ranked[1]?.c ?? primary;
  return [primary, secondary];
}

function buildReadPaths(
  primary: OpinionatedRow,
  secondary: OpinionatedRow,
  techniques: string[],
  dnaIds: string[],
): string[] {
  const m = loadDesignManifest();
  const techPaths = techniques
    .map((id) =>
      (m.techniques as { id: string; sandbox_read_path?: string; file_path: string }[]).find((t) => t.id === id)
    )
    .filter(Boolean)
    .map((t) => t!.sandbox_read_path ?? t!.file_path);

  const dnaPaths = dnaIds
    .map((id) => (m.dna_seeds as { id: string; sandbox_read_path?: string }[]).find((d) => d.id === id))
    .filter(Boolean)
    .map((d) => d!.sandbox_read_path ?? `packages/forge-ui/src/design-dna/seeds.ts`);

  return [
    primary.sandbox_read_path,
    secondary.sandbox_read_path,
    ...techPaths.slice(0, 2),
    ...dnaPaths.slice(0, 1),
  ].filter((p, i, arr) => p && arr.indexOf(p) === i) as string[];
}

function dnaSummariesFor(ids: string[]): Record<string, string> {
  const m = loadDesignManifest();
  const out: Record<string, string> = {};
  for (const id of ids) {
    const row = (m.dna_seeds as { id: string; summary?: string; name?: string }[]).find((d) => d.id === id);
    if (row) out[id] = (row.summary ?? row.name ?? id).slice(0, 500);
  }
  return out;
}

export function resolveDesignPackage(input: DesignResolveInput): DesignResolvePackage {
  const m = loadDesignManifest();
  const domain = input.domain.trim() || "produto digital";
  const rotation = hashRotation(input.rotationKey ?? domain);
  const opinionated = m.compositions_opinionated as OpinionatedRow[];

  const core = synthesizeCore({
    domain,
    moodOverride: input.moodOverride,
    excludeVoices: input.excludeVoices,
    excludeTechniques: input.excludeTechniques,
    rotationKey: input.rotationKey,
    extractedDnaIds: input.extractedDnaIds,
  });

  let [primary, secondary] = pickCompositions(
    opinionated,
    core.voice,
    core.mood,
    rotation,
    input.sections,
  );

  let proposal: SynthesisProposal = {
    voice: core.voice,
    reasoning: core.reasoning,
    moment: `${primary.moment} — adaptado para ${domain}`,
    techniques: core.techniques,
    relevant_dnas: core.relevant_dnas,
    mood: core.mood,
    anti_patterns: core.anti_patterns,
    confidence: core.confidence,
    research_queries: core.research_queries,
  };

  let critic = reviewSynthesisFull(proposal);

  if (!critic.pass) {
    const altCore = synthesizeCore({
      domain,
      moodOverride: core.mood,
      excludeVoices: core.voice,
      excludeTechniques: input.excludeTechniques,
      rotationKey: `${input.rotationKey ?? domain}-fallback`,
      extractedDnaIds: input.extractedDnaIds,
    });
    [primary, secondary] = pickCompositions(
      opinionated,
      altCore.voice,
      altCore.mood,
      rotation + 1,
      input.sections,
      [primary.id],
    );
    proposal = {
      voice: altCore.voice,
      reasoning: `Fallback: ${altCore.reasoning}`,
      moment: `${secondary.moment} — craft para ${domain}`,
      techniques: altCore.techniques,
      relevant_dnas: altCore.relevant_dnas,
      mood: altCore.mood,
      anti_patterns: altCore.anti_patterns,
      confidence: Math.max(0.55, altCore.confidence - 0.1),
      research_queries: altCore.research_queries,
    };
    critic = reviewSynthesisFull(proposal);
  }

  const read_paths = buildReadPaths(primary, secondary, proposal.techniques, proposal.relevant_dnas);
  const dna_summaries = dnaSummariesFor(proposal.relevant_dnas);

  const summary = [
    `**Domain:** ${domain}`,
    `**Voice:** ${proposal.voice.join(" + ")}`,
    `**Mood:** ${proposal.mood}`,
    `**Moment:** ${proposal.moment}`,
    `**Compositions:** ${primary.id}, ${secondary.id} (${primary.export}, ${secondary.export})`,
    `**Techniques:** ${proposal.techniques.join(", ")}`,
    `**DNA:** ${proposal.relevant_dnas.join(", ")}`,
    `**Read paths:** ${read_paths.join("; ")}`,
    `**Research:** ${(proposal.research_queries ?? []).join("; ")}`,
    `**Anti-patterns:** ${proposal.anti_patterns.slice(0, 3).join("; ")}`,
    `**Reasoning:** ${proposal.reasoning}`,
  ].join("\n");

  return {
    proposal,
    compositions: [primary.id, secondary.id],
    composition_exports: [primary.export, secondary.export],
    techniques: proposal.techniques,
    relevant_dnas: proposal.relevant_dnas,
    read_paths,
    anti_patterns: proposal.anti_patterns,
    critic: {
      pass: critic.pass,
      warnings: critic.warnings,
      blocks: critic.blocks,
      suggestions: critic.suggestions,
    },
    summary: summary.slice(0, 2500),
    dna_summaries,
  };
}