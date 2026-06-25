// design-resolve.ts — Síntese determinística de design (zero LLM) para agent-run.
import { reviewSynthesisFull } from "./design-critic-edge.ts";
import { loadDesignManifest } from "./design-manifest.ts";
import { hashRotation, synthesizeCore } from "./design-synthesis.ts";
import { TECHNIQUE_MASTERY } from "./techniques-mastery.ts";
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

// Mapa de seção para cada composição — usado para garantir diversidade.
const SECTION_ROLES: Record<string, string> = {
  "hero-editorial-split": "hero",
  "hero-brutalist-typography": "hero",
  "hero-cinematic-spotlight": "hero",
  "interactive-hero-demo": "hero",
  "parallax-product-showcase": "hero",
  "kinetic-headline-reveal": "hero",
  "bento-dense-showcase": "features",
  "spotlight-showcase-grid": "features",
  "section-tabs-feature-lanes": "features",
  "sticky-stack-narrative": "narrative",
  "editorial-magazine-split": "narrative",
  "glass-nav-floating": "nav",
  "grain-artisanal-overlay": "overlay",
  "process-steps-how-it-works": "steps",
  "faq-accordion-craft": "faq",
};

/** Ordem de prioridade de seções — hero sempre primeiro, depois features/narrative, depois o resto. */
const SECTION_PRIORITY: Record<string, number> = {
  hero: 0,
  nav: 1,
  features: 2,
  narrative: 3,
  steps: 4,
  overlay: 5,
  faq: 6,
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
  // Rotação: composições menos usadas recebem boost para evitar repetição
  // O rotation é derivado do rotationKey, garantindo que mesmo domínios iguais
  // com projects diferentes gerem seleções distintas.
  score += (hashRotation(comp.id + String(rotation)) % 20) * 0.08;
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

/**
 * Seleciona 3-5 composições garantindo diversidade de seção.
 *
 * Algoritmo:
 * 1. Pontua TODAS as composições
 * 2. Agrupa por seção (SECTION_ROLES)
 * 3. Pega a melhor composição de cada seção disponível
 * 4. Ordena por prioridade de seção (hero → nav → features → narrative → ...)
 * 5. Retorna as primeiras N (mínimo 3, máximo 5)
 */
function pickCompositions(
  opinionated: OpinionatedRow[],
  voice: string[],
  mood: string,
  rotation: number,
  sections?: string[],
  excludeIds: string[] = [],
  minCount = 3,
  maxCount = 5,
): OpinionatedRow[] {
  const boost = sectionBoostIds(sections);
  const filtered = opinionated.filter((c) => !excludeIds.includes(c.id));

  // 1. Pontua todas
  const scored = filtered.map((c) => ({
    c,
    score: scoreComposition(c, voice, mood, rotation, boost),
    section: SECTION_ROLES[c.id] ?? "other",
  }));

  // 2. Agrupa por seção, pega a melhor de cada
  const bySection = new Map<string, typeof scored[0]>();
  for (const item of scored) {
    const existing = bySection.get(item.section);
    if (!existing || item.score > existing.score) {
      bySection.set(item.section, item);
    }
  }

  // 3. Ordena por prioridade de seção
  const selected = [...bySection.entries()]
    .sort((a, b) => (SECTION_PRIORITY[a[0]] ?? 99) - (SECTION_PRIORITY[b[0]] ?? 99))
    .map(([, item]) => item.c);

  // 4. Se ainda não temos o mínimo, completa com as melhores pontuações restantes
  if (selected.length < minCount) {
    const usedIds = new Set(selected.map((c) => c.id));
    const remaining = scored
      .filter((item) => !usedIds.has(item.c.id))
      .sort((a, b) => b.score - a.score);

    for (const item of remaining) {
      if (selected.length >= maxCount) break;
      selected.push(item.c);
    }
  }

  // 5. Garante mínimo, corta no máximo
  const result = selected.slice(0, maxCount);
  while (result.length < minCount && opinionated.length > 0) {
    const fallback = opinionated.find((c) => !result.some((r) => r.id === c.id));
    if (fallback) result.push(fallback);
    else break;
  }

  return result;
}

function buildReadPaths(
  compositions: OpinionatedRow[],
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

  const compPaths = compositions.map((c) => c.sandbox_read_path);
  return [
    ...compPaths,
    ...techPaths.slice(0, 3),
    ...dnaPaths.slice(0, 2),
  ].filter((p, i, arr) => p && arr.indexOf(p) === i) as string[];
}

function techniqueBlurbsFor(ids: string[]): string {
  // ponytail: conecta techniques-mastery ao resolve — só as técnicas ESCOLHIDAS (2-4),
  // não as 21. Cada uma vem com o efeito perceptual: o LLM sabe o que ela FAZ, não só o nome.
  const lines: string[] = [];
  for (const id of ids) {
    const m = TECHNIQUE_MASTERY[id];
    if (!m) continue;
    lines.push(`  - ${id} — ${m.perceptual_effect}`);
  }
  return lines.length
    ? lines.join("\n")
    : `  - ${ids.join(", ")} (sem domínio perceptual catalogado — faça fs_read da técnica real para entender o efeito)`;
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

  let selected = pickCompositions(
    opinionated,
    core.voice,
    core.mood,
    rotation,
    input.sections,
  );

  let primary = selected[0];
  let momentSeed = primary?.moment ?? "Hero com hierarquia clara";

  // Momento rico e verificável: gesto da composição + técnicas + mood + adaptação ao domínio
  const momentVerifiers = [
    `técnicas: ${core.techniques.join(", ")}`,
    `mood: ${core.mood}`,
    `vozes: ${core.voice.join(" + ")}`,
  ];
  const enrichedMoment = `${momentSeed} — ${momentVerifiers[0]} | ${momentVerifiers[1]} | adaptado para ${domain}`;

  let proposal: SynthesisProposal = {
    voice: core.voice,
    reasoning: core.reasoning,
    moment: enrichedMoment,
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
    selected = pickCompositions(
      opinionated,
      altCore.voice,
      altCore.mood,
      rotation + 1,
      input.sections,
      selected.map((c) => c.id),
    );
    primary = selected[0];
    const fallbackVerifiers = [
      `técnicas: ${altCore.techniques.join(", ")}`,
      `mood: ${altCore.mood}`,
      `vozes: ${altCore.voice.join(" + ")}`,
    ];
    proposal = {
      voice: altCore.voice,
      reasoning: `Fallback: ${altCore.reasoning}`,
      moment: `${primary?.moment ?? "Hero"} — ${fallbackVerifiers[0]} | ${fallbackVerifiers[1]} | craft para ${domain}`,
      techniques: altCore.techniques,
      relevant_dnas: altCore.relevant_dnas,
      mood: altCore.mood,
      anti_patterns: altCore.anti_patterns,
      confidence: Math.max(0.55, altCore.confidence - 0.1),
      research_queries: altCore.research_queries,
    };
    critic = reviewSynthesisFull(proposal);
  }

  const read_paths = buildReadPaths(selected, proposal.techniques, proposal.relevant_dnas);
  const dna_summaries = dnaSummariesFor(proposal.relevant_dnas);

  const compsStr = selected.map((c) => `${c.id} (${c.export})`).join(", ");
  const sectionsStr = [...new Set(selected.map((c) => SECTION_ROLES[c.id] ?? "other").filter(Boolean))].join(", ");

  // ponytail: composto criacional — a síntese entrega a PALETA e o convite, não a receita.
  // Frase simples → gesto memorável: o espaço combinatório (vozes × mood × técnicas) é explicitado
  // e as composições são LIÇÕES a absorver, não templates a colar. O gesto concreto é do LLM.
  const techBlurbs = techniqueBlurbsFor(proposal.techniques);
  const compositeInvocation = [
    "## 🧬 COMPOSTO CRIACIONAL",
    "",
    "O que acontece se você juntar **isto** com **aquilo** — e adicionar **aquilo outro**?",
    "Sua paleta combinatória:",
    `- **Vozes:** ${proposal.voice.join(" + ")} — leia a FILOSOFIA de cada uma, não só o nome.`,
    `- **Mood:** ${proposal.mood} — a temperatura emocional da página.`,
    `- **Técnicas (paleta, não mandato) — o que cada uma FAZ com o usuário:**`,
    techBlurbs,
    `  Troque livremente se outra servir melhor ao gesto memorável — importa a INTENÇÃO, não a lista.`,
    "",
    `**Composições opinionated (${selected.length}):** ${compsStr}.`,
    "São **inspiração e lições de design** — absorva a INTENÇÃO, NÃO COPIE o JSX. Use-as como estudo e ponto de partida; o que constrói é seu.",
    "",
    "**Seu gesto-memorável é por inventar.** Uma página, um momento que o usuário LEVARÁ ao fechar o laptop. Concreto. Específico deste domínio. Surpreendente. O restante da página EXISTE para servir a este gesto.",
    "",
    "---",
    "",
  ].join("\n");

  const mechanicalSummary = [
    `**Domain:** ${domain}`,
    `**Voice:** ${proposal.voice.join(" + ")}`,
    `**Mood:** ${proposal.mood}`,
    `**Moment (SEED — transcenda):** ${proposal.moment}`,
    `**Compositions (${selected.length}):** ${compsStr}`,
    `**Seções cobertas:** ${sectionsStr}`,
    `**Techniques:** ${proposal.techniques.join(", ")}`,
    `**DNA:** ${proposal.relevant_dnas.join(", ")}`,
    `**Read paths:** ${read_paths.join("; ")}`,
    `**Research:** ${(proposal.research_queries ?? []).join("; ")}`,
    `**Anti-patterns:** ${proposal.anti_patterns.slice(0, 3).join("; ")}`,
    `**Reasoning:** ${proposal.reasoning}`,
  ].join("\n");

  const summary = compositeInvocation + "\n" + mechanicalSummary;

  return {
    proposal,
    compositions: selected.map((c) => c.id),
    composition_exports: selected.map((c) => c.export),
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