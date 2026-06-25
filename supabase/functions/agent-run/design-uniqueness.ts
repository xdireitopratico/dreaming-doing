// design-uniqueness.ts — Scoring de unicidade entre projetos.
// Compara o design atual contra o histórico de designs anteriores para
// garantir que cada projeto receba uma identidade visual DISTINTA.
// Usado no observer pós-build e opcionalmente no plan para forçar rotação.

import type { DesignPlanField } from "./types.ts";
import type { DesignSignatureRecord } from "./design-plan-field.ts";
import type { DesignTelemetryEvent } from "./design-telemetry.ts";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface UniquenessEvidence {
  /** Quão similar o design atual é a cada design anterior (0=diferente, 1=idêntico) */
  similarities: Array<{
    score: number;
    reason: string;
    comparison_to?: string; // project name/id
  }>;
  /** Dimensões com maior sobreposição */
  overlapping_dimensions: string[];
  /** Dimensões únicas deste design */
  unique_dimensions: string[];
}

export interface UniquenessResult {
  pass: boolean;
  /** 0 = idêntico a algum anterior, 1 = completamente único */
  score: number;
  threshold: number;
  evidence: UniquenessEvidence;
  /** Sugestões de rotação para aumentar unicidade */
  rotation_suggestions: string[];
  telemetry: DesignTelemetryEvent[];
}

// ──────────────────────────────────────────────
// Similarity scoring per dimension
// ──────────────────────────────────────────────

/**
 * Jaccard similarity between two string arrays.
 * 1 = identical, 0 = no overlap.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Score how similar two designs are (0 = completely different, 1 = identical).
 * Lower is better for uniqueness.
 */
function scoreDesignSimilarity(
  current: DesignPlanField,
  previous: DesignSignatureRecord,
): { score: number; dimensions: string[] } {
  const overlapping: string[] = [];
  const weights = { voice: 0.30, mood: 0.20, techniques: 0.25, compositions: 0.25 };

  // Voice similarity
  const voiceSim = current.voice?.length
    ? jaccardSimilarity(current.voice, previous.voice ?? [])
    : 0;
  if (voiceSim > 0.5) overlapping.push("voice");

  // Mood similarity
  const moodSim = current.mood && previous.mood && current.mood === previous.mood ? 1 : 0;
  if (moodSim > 0) overlapping.push("mood");

  // Technique similarity
  const techSim = current.techniques?.length
    ? jaccardSimilarity(current.techniques, previous.techniques ?? [])
    : 0;
  if (techSim > 0.5) overlapping.push("techniques");

  // Composition similarity
  const compSim = current.compositions?.length
    ? jaccardSimilarity(current.compositions, previous.compositions ?? [])
    : 0;
  if (compSim > 0.5) overlapping.push("compositions");

  // Weighted overall similarity
  const weightedSum =
    voiceSim * weights.voice +
    moodSim * weights.mood +
    techSim * weights.techniques +
    compSim * weights.compositions;

  return { score: weightedSum, dimensions: overlapping };
}

// ──────────────────────────────────────────────
// Rotation suggestions
// ──────────────────────────────────────────────

const SUGGEST_VOICE_SWAP: Record<string, string[]> = {
  swiss: ["brutalist", "editorial", "minimal"],
  brutalist: ["editorial", "swiss", "organic"],
  editorial: ["brutalist", "swiss", "art-deco"],
  "high-tech": ["swiss", "minimal", "cyberpunk"],
  "japanese-minimalism": ["organic", "minimal", "editorial"],
  bauhaus: ["swiss", "brutalist", "memphis"],
  cyberpunk: ["high-tech", "y2k", "neon"],
  "art-deco": ["editorial", "royal", "minimal"],
  memphis: ["bauhaus", "y2k", "brutalist"],
  y2k: ["cyberpunk", "high-tech", "memphis"],
  organic: ["japanese-minimalism", "editorial", "brutalist"],
  minimal: ["swiss", "japanese-minimalism", "high-tech"],
};

function suggestRotation(
  current: DesignPlanField,
  previous: DesignSignatureRecord,
): string[] {
  const suggestions: string[] = [];

  // If voice overlaps, suggest swapping one of the voices
  if (current.voice?.length && previous.voice?.length) {
    const sharedVoices = current.voice.filter((v) => previous.voice!.includes(v));
    for (const v of sharedVoices) {
      const alternatives = SUGGEST_VOICE_SWAP[v];
      if (alternatives) {
        const unused = alternatives.filter((a) => !current.voice.includes(a));
        if (unused.length > 0) {
          suggestions.push(`Troque "${v}" por "${unused[0]}" para fresh voice`);
        }
      }
    }
  }

  // If mood is the same, suggest a different mood
  if (current.mood && previous.mood && current.mood === previous.mood) {
    const altMoods = ["ocean", "mono", "ember", "sand", "sunset", "neon", "forest", "royal"].filter(
      (m) => m !== current.mood,
    );
    suggestions.push(`Troque mood "${current.mood}" por "${altMoods[0]}" (ou ${altMoods[1]})`);
  }

  // If compositions overlap, suggest different section types
  if (current.compositions?.length && previous.compositions?.length) {
    const sharedComps = current.compositions.filter((c) => previous.compositions!.includes(c));
    if (sharedComps.length > 0) {
      suggestions.push(
        `Evite composições repetidas: ${sharedComps.slice(0, 2).join(", ")} já usadas em projeto anterior`,
      );
    }
  }

  // If techniques overlap, suggest alternative techniques
  if (current.techniques?.length && previous.techniques?.length) {
    const sharedTechs = current.techniques.filter((t) => previous.techniques!.includes(t));
    if (sharedTechs.length >= 2) {
      suggestions.push(`Experimente 1-2 técnicas novas — ${sharedTechs.slice(0, 2).join(", ")} são repetidas`);
    }
  }

  return suggestions;
}

// ──────────────────────────────────────────────
// Main uniqueness check
// ──────────────────────────────────────────────

/**
 * Avalia o quão único um design é em relação ao histórico de designs anteriores.
 *
 * @param current - O DesignPlanField atual (proposto ou gerado)
 * @param history - Lista de assinaturas de designs anteriores (do projects.design_signature)
 * @param threshold - Score mínimo para considerar "único o suficiente" (default 0.6)
 * @returns UniquenessResult
 */
export function evaluateDesignUniqueness(
  current: DesignPlanField,
  history: DesignSignatureRecord[],
  threshold = 0.6,
): UniquenessResult {
  const telemetry: DesignTelemetryEvent[] = [];

  if (!history.length) {
    // Primeiro design — sempre único
    telemetry.push({
      kind: "design_uniqueness",
      ok: true,
      detail: JSON.stringify({ score: 1, reason: "first_design" }),
      at: new Date().toISOString(),
    });
    return {
      pass: true,
      score: 1,
      threshold,
      evidence: {
        similarities: [],
        overlapping_dimensions: [],
        unique_dimensions: ["voice", "mood", "techniques", "compositions"],
      },
      rotation_suggestions: [],
      telemetry,
    };
  }

  const similarities: UniquenessEvidence["similarities"] = [];
  let maxSimilarity = 0;
  const allOverlapping = new Set<string>();

  for (let i = 0; i < history.length; i++) {
    const prev = history[i];
    const { score, dimensions } = scoreDesignSimilarity(current, prev);
    similarities.push({
      score,
      reason:
        score < 0.3
          ? `Design ${i + 1}/${history.length}: baixa similaridade`
          : `Design ${i + 1}/${history.length}: ${(score * 100).toFixed(0)}% similar (${dimensions.join(", ")})`,
    });
    if (score > maxSimilarity) maxSimilarity = score;
    dimensions.forEach((d) => allOverlapping.add(d));
  }

  // Uniqueness score = 1 - max similarity
  const uniquenessScore = 1 - maxSimilarity;

  // Determine unique dimensions
  const allDimensions = ["voice", "mood", "techniques", "compositions"];
  const uniqueDimensions = allDimensions.filter((d) => !allOverlapping.has(d));

  // Generate rotation suggestions if below threshold
  let rotation_suggestions: string[] = [];
  if (uniquenessScore < threshold) {
    const mostSimilar = similarities.reduce((a, b) => (a.score > b.score ? a : b));
    const idx = similarities.indexOf(mostSimilar);
    const prevDesign = history[idx];
    if (prevDesign) {
      rotation_suggestions = suggestRotation(current, prevDesign);
    }
  }

  const pass = uniquenessScore >= threshold;

  telemetry.push({
    kind: "design_uniqueness",
    ok: pass,
    detail: JSON.stringify({
      score: Math.round(uniquenessScore * 100),
      threshold: Math.round(threshold * 100),
      history_count: history.length,
      max_similarity: Math.round(maxSimilarity * 100),
    }),
    at: new Date().toISOString(),
  });

  return {
    pass,
    score: uniquenessScore,
    threshold,
    evidence: {
      similarities,
      overlapping_dimensions: [...allOverlapping],
      unique_dimensions: uniqueDimensions,
    },
    rotation_suggestions,
    telemetry,
  };
}

/**
 * Formata o resultado de unicidade para feedback do LLM.
 */
export function formatUniquenessFeedback(result: UniquenessResult): string {
  if (result.pass) {
    return [
      `DESIGN UNIQUENESS OK — score ${(result.score * 100).toFixed(0)}% (threshold ${(result.threshold * 100).toFixed(0)}%)`,
      `Dimensões únicas: ${result.evidence.unique_dimensions.join(", ")}`,
    ].join("\n");
  }

  const lines: string[] = [
    `DESIGN UNIQUENESS BAIXA — score ${(result.score * 100).toFixed(0)}% (threshold ${(result.threshold * 100).toFixed(0)}%)`,
    "",
    "Este design é muito similar a projetos anteriores. Para garantir identidade visual única:",
    "",
  ];

  if (result.evidence.overlapping_dimensions.length > 0) {
    lines.push("Dimensões com sobreposição:");
    for (const d of result.evidence.overlapping_dimensions) {
      lines.push(`  - ${d}: já usado em design anterior`);
    }
    lines.push("");
  }

  if (result.rotation_suggestions.length > 0) {
    lines.push("Sugestões de rotação:");
    for (const s of result.rotation_suggestions) {
      lines.push(`  → ${s}`);
    }
    lines.push("");
  }

  if (result.evidence.similarities.length > 0) {
    lines.push("Similaridade com designs anteriores:");
    for (const s of result.evidence.similarities) {
      if (s.score > 0.3) lines.push(`  ${(s.score * 100).toFixed(0)}% — ${s.reason}`);
    }
  }

  return lines.join("\n");
}
