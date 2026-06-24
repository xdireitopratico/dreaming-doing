// design-synthesis.ts — Síntese determinística portada de forge-ui/synthesis/engine (manifest-only, Edge-safe).
import { loadDesignManifest } from "./design-manifest.ts";

export type ManifestLanguage = {
  id: string;
  name: string;
  serves: string[];
  combines_with: { id: string; reasoning: string; moment: string }[];
  conflicts_with: string[];
  anti_patterns: string[];
  compatible_moods: string[];
  reference_queries: string[];
  principles: string[];
};

export type SynthesisCoreInput = {
  domain: string;
  moodOverride?: string;
  excludeVoices?: string[];
  excludeTechniques?: string[];
  rotationKey?: string;
  extractedDnaIds?: string[];
};

const MOODS = ["ember", "ocean", "forest", "mono", "neon", "sand", "royal", "sunset"] as const;

const TECHNIQUE_MAP: Record<string, string[]> = {
  swiss: ["scroll-reveal", "sticky-stack"],
  brutalist: ["kinetic-typography", "grain-texture-overlay"],
  editorial: ["scroll-reveal", "sticky-stack", "parallax-depth"],
  "high-tech": ["animated-mesh-background", "spotlight-cursor", "magnetic-interaction"],
  "japanese-minimalism": ["scroll-reveal", "grain-texture-overlay"],
  bauhaus: ["scroll-reveal", "count-up-metrics"],
  cyberpunk: ["kinetic-typography", "animated-mesh-background", "infinite-marquee"],
  "art-deco": ["scroll-reveal", "parallax-depth"],
  memphis: ["tilt-hover", "infinite-marquee", "count-up-metrics"],
  y2k: ["tilt-hover", "spotlight-cursor", "animated-mesh-background"],
  organic: ["parallax-depth", "scroll-reveal", "magnetic-interaction"],
  minimal: ["scroll-reveal"],
};

function languages(): Record<string, ManifestLanguage> {
  const m = loadDesignManifest();
  const out: Record<string, ManifestLanguage> = {};
  for (const lang of m.visual_languages as ManifestLanguage[]) {
    if (lang.id && lang.serves) out[lang.id] = lang;
  }
  return out;
}

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

export function suggestLanguagesForDomain(domain: string): string[] {
  const langs = languages();
  const d = domain.toLowerCase();
  const matches: string[] = [];
  for (const lang of Object.values(langs)) {
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

function scoreCombination(lang1: string, lang2: string, domain: string, LANGS: Record<string, ManifestLanguage>): number {
  let score = 0;
  const l1 = LANGS[lang1];
  const l2 = LANGS[lang2];
  if (!l1 || !l2) return 0;
  const d = domain.toLowerCase();
  if (l1.serves.some((s) => d.includes(s.toLowerCase()))) score += 1;
  if (l2.serves.some((s) => d.includes(s.toLowerCase()))) score += 1;
  if (l1.combines_with?.some((c) => c.id === lang2)) score += 2;
  if (l2.combines_with?.some((c) => c.id === lang1)) score += 2;
  if (l1.conflicts_with?.includes(lang2)) score -= 3;
  if (l2.conflicts_with?.includes(lang1)) score -= 3;
  const moodOverlap = (l1.compatible_moods ?? []).filter((m) => (l2.compatible_moods ?? []).includes(m));
  score += moodOverlap.length * 0.5;
  return score;
}

export function findBestCombination(
  candidates: string[],
  domain: string,
): { voice: string[]; reasoning: string; moment: string } {
  const LANGS = languages();
  if (candidates.length === 0) {
    return {
      voice: ["swiss"],
      reasoning: "Fallback: Swiss é a linguagem mais versátil e segura.",
      moment: "Hero tipográfico com grid rígido e mesh gradient sutil",
    };
  }
  if (candidates.length === 1) {
    const lang = LANGS[candidates[0]];
    const combo = lang?.combines_with?.[0];
    if (combo && LANGS[combo.id]) {
      return {
        voice: [candidates[0], combo.id],
        reasoning: `${lang.name} + ${LANGS[combo.id].name}: ${combo.reasoning}`,
        moment: combo.moment,
      };
    }
    return {
      voice: [candidates[0]],
      reasoning: `${lang?.name ?? candidates[0]} sozinha — sem combinação otimizada encontrada.`,
      moment: lang?.principles?.[0] ?? "Hero com hierarquia clara",
    };
  }

  let bestScore = -1;
  let bestVoice: string[] = [candidates[0]];
  let bestReasoning = "";
  let bestMoment = "";

  for (const c1 of candidates) {
    const lang1 = LANGS[c1];
    if (!lang1) continue;
    for (const combo of lang1.combines_with ?? []) {
      if (!candidates.includes(combo.id) && !LANGS[combo.id]) continue;
      if (lang1.conflicts_with?.includes(combo.id)) continue;
      const score = scoreCombination(c1, combo.id, domain, LANGS);
      if (score > bestScore) {
        bestScore = score;
        bestVoice = [c1, combo.id];
        bestReasoning = `${lang1.name} + ${LANGS[combo.id].name}: ${combo.reasoning}`;
        bestMoment = combo.moment;
      }
    }
  }

  if (bestScore === -1) {
    bestVoice = candidates.slice(0, 2);
    const l1 = LANGS[candidates[0]];
    const l2 = LANGS[candidates[1]];
    bestReasoning = `${l1?.name ?? candidates[0]} + ${l2?.name ?? candidates[1]}: combinação por domínio.`;
    bestMoment = `Hero com ${l1?.principles?.[0]?.toLowerCase() ?? "grid"} + ${l2?.principles?.[0]?.toLowerCase() ?? "textura"}`;
  }

  return { voice: bestVoice, reasoning: bestReasoning, moment: bestMoment };
}

export function selectTechniques(voice: string[], exclude: string[]): string[] {
  const m = loadDesignManifest();
  const validIds = new Set((m.techniques as { id: string }[]).map((t) => t.id));
  const techniques = new Set<string>();
  for (const langId of voice) {
    for (const t of TECHNIQUE_MAP[langId] ?? []) {
      if (!exclude.includes(t) && validIds.has(t)) techniques.add(t);
    }
  }
  if (techniques.size < 2) {
    for (const t of ["scroll-reveal", "grain-texture-overlay"]) {
      if (!exclude.includes(t) && validIds.has(t)) techniques.add(t);
    }
  }
  return [...techniques].slice(0, 4);
}

export function selectRelevantDnas(
  voice: string[],
  mood: string,
  domain: string,
  extractedDnaIds: string[] = [],
): string[] {
  const m = loadDesignManifest();
  const pool = m.dna_seeds as {
    id: string;
    serves_domains: string[];
    compatible_languages?: string[];
    compatible_moods?: string[];
  }[];
  const valid = new Set(pool.map((d) => d.id));
  const extracted = extractedDnaIds.filter((id) => valid.has(id));
  const dLower = domain.toLowerCase();
  const byDomain = pool.filter((dna) =>
    dna.serves_domains.some((s) => dLower.includes(s.toLowerCase()) || s.toLowerCase().includes(dLower)),
  );
  const byVoice = (byDomain.length ? byDomain : pool).filter((dna) =>
    (dna.compatible_languages ?? []).some((lang) => voice.includes(lang)),
  );
  const byMood = byVoice.filter((dna) => (dna.compatible_moods ?? []).includes(mood));
  const ranked = (byMood.length ? byMood : byVoice.length ? byVoice : pool).map((d) => d.id);
  return [...new Set([...extracted, ...ranked])].slice(0, 2);
}

export function collectAntiPatterns(voice: string[]): string[] {
  const LANGS = languages();
  const patterns = new Set<string>([
    "hero centralizado com 3 cards simétricos",
    "gradiente violeta-índigo genérico",
    "HeroSignature+BentoGrid sem hero opinionated",
    "Inter medium sem hierarquia",
  ]);
  for (const langId of voice) {
    for (const ap of LANGS[langId]?.anti_patterns ?? []) patterns.add(ap);
  }
  return [...patterns];
}

export function collectResearchQueries(voice: string[], domain: string): string[] {
  const LANGS = languages();
  const queries = new Set<string>();
  for (const langId of voice) {
    for (const q of LANGS[langId]?.reference_queries ?? []) queries.add(q);
  }
  queries.add(`${domain} landing page design awwwards`);
  return [...queries].slice(0, 5);
}

export function synthesizeCore(input: SynthesisCoreInput): {
  voice: string[];
  reasoning: string;
  moment: string;
  techniques: string[];
  relevant_dnas: string[];
  mood: string;
  anti_patterns: string[];
  research_queries: string[];
  confidence: number;
} {
  const mood =
    input.moodOverride && MOODS.includes(input.moodOverride as (typeof MOODS)[number])
      ? input.moodOverride
      : suggestMoodForDomain(input.domain);

  let candidates = suggestLanguagesForDomain(input.domain).filter(
    (v) => !(input.excludeVoices ?? []).includes(v),
  );
  if (candidates.length === 0) candidates = suggestLanguagesForDomain(input.domain);

  const { voice, reasoning, moment } = findBestCombination(candidates, input.domain);
  const techniques = selectTechniques(voice, input.excludeTechniques ?? []);
  const relevant_dnas = selectRelevantDnas(voice, mood, input.domain, input.extractedDnaIds);
  const anti_patterns = collectAntiPatterns(voice);
  const research_queries = collectResearchQueries(voice, input.domain);
  const confidence = Math.min(0.95, 0.5 + voice.length * 0.15 + techniques.length * 0.08);

  return {
    voice,
    reasoning,
    moment,
    techniques,
    relevant_dnas,
    mood,
    anti_patterns,
    research_queries,
    confidence,
  };
}

export function hashRotation(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}