// design-resolve.ts — Síntese determinística de design (zero LLM) para agent-run.
import { loadDesignManifest } from "./design-manifest.ts";
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
};

export type CriticResult = {
  pass: boolean;
  warnings: string[];
  blocks: string[];
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
};

const MOODS = ["ember", "ocean", "forest", "mono", "neon", "sand", "royal", "sunset"] as const;

const GLOBAL_ANTI_PATTERNS = [
  "hero centralizado com 3 cards simétricos",
  "gradiente violeta-índigo genérico",
  "HeroSignature+BentoGrid sem hero opinionated",
  "Inter medium sem hierarquia",
];

function suggestMoodForDomain(domain: string): string {
  const d = domain.toLowerCase();
  if (/\b(padaria|bakery|food|café|cafe|gourmet)\b/.test(d)) return "sand";
  if (/\b(saas|fintech|finance|dashboard|dev)\b/.test(d)) return "ocean";
  if (/\b(eco|health|saúde|nature|wellness)\b/.test(d)) return "forest";
  if (/\b(cyber|gaming|web3|crypto|neon)\b/.test(d)) return "neon";
  if (/\b(lux|luxo|premium|imobili)\b/.test(d)) return "royal";
  if (/\b(fashion|moda|beauty|lifestyle)\b/.test(d)) return "sunset";
  if (/\b(minimal|editorial|portfolio|studio)\b/.test(d)) return "mono";
  return "ember";
}

function suggestLanguagesForDomain(domain: string): string[] {
  const m = loadDesignManifest();
  const d = domain.toLowerCase();
  const matches: string[] = [];
  for (const lang of m.visual_languages as { id: string; serves: string[] }[]) {
    if (lang.serves.some((s) => d.includes(s.toLowerCase()) || s.toLowerCase().includes(d))) {
      matches.push(lang.id);
    }
  }
  if (matches.length > 0) return matches;
  if (/\b(bakery|padaria|food|artisanal)\b/.test(d)) return ["brutalist", "editorial", "organic"];
  if (/\b(saas|fintech|tech|dashboard)\b/.test(d)) return ["swiss", "high-tech", "minimal"];
  if (/\b(fashion|beauty|magazine)\b/.test(d)) return ["editorial", "art-deco", "minimal"];
  if (/\b(gaming|crypto|web3)\b/.test(d)) return ["cyberpunk", "y2k", "high-tech"];
  if (/\b(eco|wellness|yoga)\b/.test(d)) return ["organic", "japanese-minimalism", "minimal"];
  if (/\b(agency|studio|portfolio|creative)\b/.test(d)) return ["brutalist", "editorial", "swiss"];
  return ["swiss", "editorial"];
}

function hashRotation(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

function pickVoices(domain: string, exclude: string[]): string[] {
  let candidates = suggestLanguagesForDomain(domain).filter((v) => !exclude.includes(v));
  if (candidates.length === 0) candidates = suggestLanguagesForDomain(domain);
  const primary = candidates[0] ?? "swiss";
  const secondary = candidates.find((c) => c !== primary) ?? "editorial";
  return [primary, secondary].filter((v, i, a) => a.indexOf(v) === i);
}

function scoreComposition(
  comp: {
    id: string;
    voice: string[];
    compatible_moods: string[];
    techniques: string[];
  },
  voice: string[],
  mood: string,
  rotation: number,
): number {
  let score = 0;
  for (const v of voice) if (comp.voice.includes(v)) score += 3;
  if (comp.compatible_moods.includes(mood)) score += 2;
  score += (hashRotation(comp.id + String(rotation)) % 5) * 0.1;
  return score;
}

function reviewSynthesis(proposal: SynthesisProposal): CriticResult {
  const m = loadDesignManifest();
  const langIds = new Set((m.visual_languages as { id: string }[]).map((l) => l.id));
  const techIds = new Set((m.techniques as { id: string }[]).map((t) => t.id));
  const blocks: string[] = [];
  const warnings: string[] = [];
  for (const v of proposal.voice) {
    if (!langIds.has(v)) blocks.push(`Linguagem desconhecida: ${v}`);
  }
  for (const t of proposal.techniques) {
    if (!techIds.has(t)) blocks.push(`Técnica desconhecida: ${t}`);
  }
  if (proposal.techniques.length === 0) warnings.push("Nenhuma técnica selecionada");
  if (/hero.*bento|bento.*hero/i.test(proposal.moment)) {
    warnings.push("Momento genérico hero+bento");
  }
  return { pass: blocks.length === 0, warnings, blocks };
}

export function resolveDesignPackage(input: DesignResolveInput): DesignResolvePackage {
  const m = loadDesignManifest();
  const domain = input.domain.trim() || "produto digital";
  const mood =
    input.moodOverride && MOODS.includes(input.moodOverride as (typeof MOODS)[number])
      ? input.moodOverride
      : suggestMoodForDomain(domain);
  const voice = pickVoices(domain, input.excludeVoices ?? []);
  const rotation = hashRotation(input.rotationKey ?? domain);

  const opinionated = m.compositions_opinionated as {
    id: string;
    export: string;
    moment: string;
    voice: string[];
    techniques: string[];
    compatible_moods: string[];
    sandbox_read_path: string;
  }[];

  const ranked = [...opinionated]
    .map((c) => ({ c, score: scoreComposition(c, voice, mood, rotation) }))
    .sort((a, b) => b.score - a.score);

  const primary = ranked[0]?.c ?? opinionated[0];
  const secondary = ranked.find((r) => r.c.id !== primary.id)?.c ?? ranked[1]?.c ?? primary;

  const techniqueSet = new Set<string>();
  for (const t of [...primary.techniques, ...secondary.techniques]) {
    if (!input.excludeTechniques?.includes(t)) techniqueSet.add(t);
  }
  for (const t of ["scroll-reveal", "grain-texture-overlay"]) {
    if (techniqueSet.size < 3) techniqueSet.add(t);
  }
  const techniques = [...techniqueSet].slice(0, 3);

  const dnaPool = m.dna_seeds as { id: string; serves_domains: string[] }[];
  const dLower = domain.toLowerCase();
  const relevant_dnas = dnaPool
    .filter((dna) =>
      dna.serves_domains.some((s) => dLower.includes(s.toLowerCase()) || s.toLowerCase().includes(dLower)),
    )
    .map((d) => d.id)
    .slice(0, 2);
  const dnaFallback = dnaPool.slice(0, 2).map((d) => d.id);
  const extracted = (input.extractedDnaIds ?? []).filter((id) => dnaPool.some((d) => d.id === id));
  const mergedDnas = [...new Set([...extracted, ...relevant_dnas])].slice(0, 2);
  const finalDnas = mergedDnas.length > 0 ? mergedDnas : dnaFallback;

  const moment = `${primary.moment} — adaptado para ${domain}`;
  const reasoning = `Síntese ${voice.join(" + ")} com mood ${mood} para ${domain}. Composições: ${primary.export}, ${secondary.export}.`;

  const proposal: SynthesisProposal = {
    voice,
    reasoning,
    moment,
    techniques,
    relevant_dnas: finalDnas,
    mood,
    anti_patterns: GLOBAL_ANTI_PATTERNS,
    confidence: 0.85,
  };

  let critic = reviewSynthesis(proposal);
  if (!critic.pass) {
    proposal.voice = ["swiss", "editorial"];
    proposal.reasoning = `Fallback swiss+editorial para ${domain}.`;
    critic = reviewSynthesis(proposal);
  }

  const techPaths = techniques
    .map((id) => (m.techniques as { id: string; sandbox_read_path?: string; file_path: string }[]).find((t) => t.id === id))
    .filter(Boolean)
    .map((t) => t!.sandbox_read_path ?? t!.file_path);

  const read_paths = [
    primary.sandbox_read_path,
    secondary.sandbox_read_path,
    ...techPaths.slice(0, 2),
  ].filter((p, i, arr) => p && arr.indexOf(p) === i) as string[];

  const summary = [
    `**Domain:** ${domain}`,
    `**Voice:** ${voice.join(" + ")}`,
    `**Mood:** ${mood}`,
    `**Moment:** ${moment}`,
    `**Compositions:** ${primary.id}, ${secondary.id} (${primary.export}, ${secondary.export})`,
    `**Techniques:** ${techniques.join(", ")}`,
    `**DNA:** ${finalDnas.join(", ")}`,
    `**Read paths:** ${read_paths.join("; ")}`,
    `**Anti-patterns:** ${GLOBAL_ANTI_PATTERNS.slice(0, 3).join("; ")}`,
    `**Reasoning:** ${reasoning}`,
  ].join("\n");

  return {
    proposal,
    compositions: [primary.id, secondary.id],
    composition_exports: [primary.export, secondary.export],
    techniques,
    relevant_dnas: finalDnas,
    read_paths,
    anti_patterns: GLOBAL_ANTI_PATTERNS,
    critic,
    summary: summary.slice(0, 2500),
  };
}