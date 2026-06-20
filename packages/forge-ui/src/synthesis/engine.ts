/**
 * Synthesis Engine — motor determinístico de síntese de design.
 *
 * Combina 2-3 linguagens visuais em uma proposta de design única.
 * Usa as regras de combines_with e conflicts_with do léxico de linguagens
 * para garantir que a síntese seja coerente (não Frankenstein).
 *
 * O motor é DETERMINÍSTICO — zero LLM na síntese. O LLM só valida/ajusta
 * no plan. Isso garante repetibilidade e tira do agente o ônus de inventar.
 */

import { VISUAL_LANGUAGES, suggestLanguagesForDomain, isVisualLanguage } from "../tokens/languages";
import { getDesignDNAStore } from "../design-dna/store";
import { suggestMoodForDomain, MOODS } from "../tokens/moods";
import { TECHNIQUE_BY_ID } from "../techniques";

export interface SynthesisProposal {
  /** Linguagens escolhidas para a síntese (2-3). */
  voice: string[];
  /** Reasoning — por que esta combinação serve ao domínio. */
  reasoning: string;
  /** O gesto-memorável concreto — a assinatura desta página. */
  moment: string;
  /** Técnicas do catálogo @forge/ui que servem a esta visão. */
  techniques: string[];
  /** DesignDNAs relevantes do catálogo — matéria-prima para o builder. */
  relevant_dnas: string[];
  /** Mood sugerido. */
  mood: string;
  /** Anti-padrões a evitar (da linguagem + global). */
  anti_patterns: string[];
  /** Queries para web_research buscar referências reais adicionais. */
  research_queries: string[];
  /** Score de confiança da síntese (0-1). */
  confidence: number;
}

export interface SynthesisInput {
  /** Domínio/descrição do projeto (ex: "padaria artesanal premium"). */
  domain: string;
  /** Mood sugerido override (se null, usa heurística). */
  moodOverride?: string;
  /** Linguagens a excluir (anti-repetição — projetos anteriores). */
  excludeVoices?: string[];
  /** Lista de técnicas já usadas (para evitar repetir). */
  excludeTechniques?: string[];
}

/**
 * Sintetiza uma proposta de design para o domínio dado.
 *
 * Algoritmo:
 * 1. Sugere linguagens por domínio (heurística)
 * 2. Filtra por excludes (anti-repetição)
 * 3. Encontra combinações válidas (combines_with)
 * 4. Ranqueia por compatibilidade de mood
 * 5. Seleciona técnicas e DNAs relevantes
 * 6. Constrói reasoning e momento-memorável
 */
export function synthesize(input: SynthesisInput): SynthesisProposal {
  const { domain, moodOverride, excludeVoices = [], excludeTechniques = [] } = input;

  // 1. Mood
  const mood = moodOverride && moodOverride in MOODS ? moodOverride : suggestMoodForDomain(domain);

  // 2. Linguagens sugeridas por domínio
  let candidates = suggestLanguagesForDomain(domain).filter((id) => !excludeVoices.includes(id));

  // Se todas foram excluídas, recomeça sem excludes
  if (candidates.length === 0) {
    candidates = suggestLanguagesForDomain(domain);
  }

  // 3. Encontra a melhor combinação
  const { voice, reasoning, moment } = findBestCombination(candidates, domain);

  // 4. Técnicas relevantes baseadas nas linguagens escolhidas
  const techniques = selectTechniques(voice, excludeTechniques);

  // 5. DesignDNAs relevantes
  const relevantDnas = selectRelevantDnas(voice, mood, domain);

  // 6. Anti-padrões das linguagens + global
  const antiPatterns = collectAntiPatterns(voice);

  // 7. Queries para web_research
  const researchQueries = collectResearchQueries(voice, domain);

  // 8. Confiança
  const confidence = calculateConfidence(voice, candidates, techniques.length);

  return {
    voice,
    reasoning,
    moment,
    techniques,
    relevant_dnas: relevantDnas,
    mood,
    anti_patterns: antiPatterns,
    research_queries: researchQueries,
    confidence,
  };
}

function findBestCombination(
  candidates: string[],
  domain: string,
): { voice: string[]; reasoning: string; moment: string } {
  if (candidates.length === 0) {
    return {
      voice: ["swiss"],
      reasoning: "Fallback: Swiss é a linguagem mais versátil e segura.",
      moment: "Hero tipográfico com grid rígido e mesh gradient sutil",
    };
  }

  if (candidates.length === 1) {
    const lang = VISUAL_LANGUAGES[candidates[0]];
    const combo = lang.combines_with[0];
    if (combo && isVisualLanguage(combo.id)) {
      return {
        voice: [candidates[0], combo.id],
        reasoning: `${lang.name} + ${VISUAL_LANGUAGES[combo.id].name}: ${combo.reasoning}`,
        moment: combo.moment,
      };
    }
    return {
      voice: [candidates[0]],
      reasoning: `${lang.name} sozinha — sem combinação otimizada encontrada.`,
      moment: lang.principles[0],
    };
  }

  // Procura a melhor combinação entre os candidatos
  let bestScore = -1;
  let bestVoice: string[] = [candidates[0]];
  let bestReasoning = "";
  let bestMoment = "";

  for (const c1 of candidates) {
    const lang1 = VISUAL_LANGUAGES[c1];
    if (!lang1) continue;

    for (const combo of lang1.combines_with) {
      if (!candidates.includes(combo.id) && !isVisualLanguage(combo.id)) continue;

      // Verifica que não conflita
      if (lang1.conflicts_with.includes(combo.id)) continue;

      const score = scoreCombination(c1, combo.id, domain);
      if (score > bestScore) {
        bestScore = score;
        bestVoice = [c1, combo.id];
        bestReasoning = `${lang1.name} + ${VISUAL_LANGUAGES[combo.id].name}: ${combo.reasoning}`;
        bestMoment = combo.moment;
      }
    }
  }

  if (bestScore === -1) {
    // Sem combinação otimizada — usa os 2 primeiros candidatos
    bestVoice = candidates.slice(0, 2);
    const l1 = VISUAL_LANGUAGES[candidates[0]];
    const l2 = VISUAL_LANGUAGES[candidates[1]];
    bestReasoning = `${l1?.name ?? candidates[0]} + ${l2?.name ?? candidates[1]}: combinação por domínio sem regra explícita.`;
    bestMoment = `Hero com ${l1?.principles[0]?.toLowerCase() ?? "grid"} + ${l2?.principles[0]?.toLowerCase() ?? "textura"}`;
  }

  return { voice: bestVoice, reasoning: bestReasoning, moment: bestMoment };
}

function scoreCombination(lang1: string, lang2: string, domain: string): number {
  let score = 0;
  const l1 = VISUAL_LANGUAGES[lang1];
  const l2 = VISUAL_LANGUAGES[lang2];
  if (!l1 || !l2) return 0;

  // +1 se ambas servem ao domínio
  const d = domain.toLowerCase();
  if (l1.serves.some((s) => d.includes(s.toLowerCase()))) score += 1;
  if (l2.serves.some((s) => d.includes(s.toLowerCase()))) score += 1;

  // +1 se combinam explicitamente
  if (l1.combines_with.some((c) => c.id === lang2)) score += 2;
  if (l2.combines_with.some((c) => c.id === lang1)) score += 2;

  // -1 se conflitam
  if (l1.conflicts_with.includes(lang2)) score -= 3;
  if (l2.conflicts_with.includes(lang1)) score -= 3;

  // +0.5 se moods compatíveis se sobrepõem
  const moodOverlap = l1.compatible_moods.filter((m) => l2.compatible_moods.includes(m));
  score += moodOverlap.length * 0.5;

  return score;
}

function selectTechniques(voice: string[], exclude: string[]): string[] {
  const techniqueMap: Record<string, string[]> = {
    swiss: ["scroll-reveal", "stagger"],
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

  const techniques = new Set<string>();
  for (const langId of voice) {
    const techs = techniqueMap[langId] ?? [];
    for (const t of techs) {
      if (!exclude.includes(t) && TECHNIQUE_BY_ID[t]) {
        techniques.add(t);
      }
    }
  }

  // Limita a 4 técnicas
  return Array.from(techniques).slice(0, 4);
}

function selectRelevantDnas(voice: string[], mood: string, domain: string): string[] {
  const store = getDesignDNAStore();
  const dnas = store.query({
    domain,
    limit: 8,
  });

  // Filtra por compatibilidade com as linguagens escolhidas
  const filtered = dnas.filter((dna) =>
    dna.compatible_languages.some((lang) => voice.includes(lang)),
  );

  // Se não há matches por linguagem, retorna por domínio
  if (filtered.length === 0) {
    return dnas.slice(0, 5).map((d) => d.id);
  }

  // Filtra por mood compatível
  const moodMatch = filtered.filter((dna) =>
    dna.compatible_moods.includes(mood),
  );

  const result = (moodMatch.length > 0 ? moodMatch : filtered).slice(0, 5);
  return result.map((d) => d.id);
}

function collectAntiPatterns(voice: string[]): string[] {
  const patterns: Set<string> = new Set();

  // Global anti-patterns
  const global = [
    "hero centralizado com 3 cards simétricos abaixo (template SaaS genérico)",
    "gradiente violeta/índigo de fundo (atrator padrão #1)",
    "glassmorphism sobre fundo chapado (sem mesh/parallax atrás)",
    "fonte Inter peso medium sem variação tipográfica",
    "botão primário rounded-full + glow colorido sem motivo semântico",
  ];
  global.forEach((p) => patterns.add(p));

  // Per-language anti-patterns
  for (const langId of voice) {
    const lang = VISUAL_LANGUAGES[langId];
    if (lang) {
      lang.anti_patterns.forEach((p) => patterns.add(p));
    }
  }

  return Array.from(patterns);
}

function collectResearchQueries(voice: string[], domain: string): string[] {
  const queries: Set<string> = new Set();

  // Domain-specific
  queries.add(`awwwards best ${domain} website design 2024 2025`);

  // Per-language
  for (const langId of voice) {
    const lang = VISUAL_LANGUAGES[langId];
    if (lang) {
      lang.reference_queries.forEach((q) => queries.add(q));
    }
  }

  return Array.from(queries).slice(0, 5);
}

function calculateConfidence(voice: string[], candidates: string[], techniqueCount: number): number {
  let conf = 0.5;

  // +0.1 por cada linguagem que estava nos candidatos
  const matchCount = voice.filter((v) => candidates.includes(v)).length;
  conf += matchCount * 0.1;

  // +0.05 por cada técnica encontrada
  conf += Math.min(techniqueCount * 0.05, 0.2);

  // +0.1 se tem 2+ linguagens (síntese rica)
  if (voice.length >= 2) conf += 0.1;

  return Math.min(conf, 0.98);
}

/**
 * Resumo da proposta de síntese para injeção no prompt do LLM.
 */
export function synthesisSummary(proposal: SynthesisProposal): string {
  return [
    `## Direção de Design Sugerida`,
    ``,
    `**Voice:** ${proposal.voice.join(" + ")}`,
    `**Mood:** ${proposal.mood}`,
    `**Momento-memorável:** ${proposal.moment}`,
    `**Técnicas:** ${proposal.techniques.join(", ")}`,
    `**Confiança:** ${(proposal.confidence * 100).toFixed(0)}%`,
    ``,
    `**Reasoning:** ${proposal.reasoning}`,
    ``,
    `**Anti-padrões a evitar:**`,
    ...proposal.anti_patterns.map((p) => `- ${p}`),
    ``,
    `**DesignDNAs relevantes:** ${proposal.relevant_dnas.join(", ")}`,
    ``,
    `**Queries para web_research (buscar referências reais):**`,
    ...proposal.research_queries.map((q) => `- "${q}"`),
  ].join("\n");
}
