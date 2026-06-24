// design-critic-edge.ts — Critic determinístico portado de forge-ui/design-critic (manifest-only).
import { loadDesignManifest } from "./design-manifest.ts";

export type CriticProposal = {
  voice: string[];
  moment: string;
  techniques: string[];
  mood: string;
  confidence: number;
};

export type CriticResult = {
  pass: boolean;
  warnings: string[];
  blocks: string[];
  suggestions: string[];
};

const GENERIC_MOMENTS = ["hero+bento", "hero e bento", "hero centralizado", "features grid", "3 cards"];

export function reviewSynthesisFull(proposal: CriticProposal): CriticResult {
  const m = loadDesignManifest();
  const langIds = new Set((m.visual_languages as { id: string }[]).map((l) => l.id));
  const techIds = new Set((m.techniques as { id: string }[]).map((t) => t.id));
  const LANGS = Object.fromEntries(
    (m.visual_languages as { id: string; name: string; conflicts_with?: string[]; compatible_moods?: string[] }[]).map(
      (l) => [l.id, l],
    ),
  );

  const warnings: string[] = [];
  const blocks: string[] = [];
  const suggestions: string[] = [];

  for (const v of proposal.voice) {
    if (!langIds.has(v)) blocks.push(`Linguagem desconhecida: ${v}`);
  }

  for (let i = 0; i < proposal.voice.length; i++) {
    for (let j = i + 1; j < proposal.voice.length; j++) {
      const l1 = LANGS[proposal.voice[i]];
      const l2 = LANGS[proposal.voice[j]];
      if (l1?.conflicts_with?.includes(proposal.voice[j])) {
        blocks.push(`${l1.name} conflita com ${l2?.name ?? proposal.voice[j]}`);
      }
    }
  }

  const momentLower = proposal.moment.toLowerCase();
  for (const generic of GENERIC_MOMENTS) {
    if (momentLower.includes(generic)) {
      blocks.push(`Momento genérico ("${generic}") — seja específico do domínio`);
    }
  }

  for (const t of proposal.techniques) {
    if (!techIds.has(t)) blocks.push(`Técnica desconhecida: ${t}`);
  }

  for (const v of proposal.voice) {
    const lang = LANGS[v];
    if (lang?.compatible_moods && !lang.compatible_moods.includes(proposal.mood)) {
      warnings.push(`Mood "${proposal.mood}" fora dos moods compatíveis de ${lang.name}`);
    }
  }

  if (proposal.techniques.length === 0) {
    suggestions.push("Adicione 2-4 técnicas do catálogo @forge/ui");
  } else if (proposal.techniques.length > 4) {
    warnings.push(`${proposal.techniques.length} técnicas — máximo recomendado é 4`);
  }

  if (proposal.voice.length === 1) {
    suggestions.push("Combine 2 linguagens visuais para síntese mais rica");
  }

  if (proposal.confidence < 0.6) {
    warnings.push(`Confiança baixa (${(proposal.confidence * 100).toFixed(0)}%)`);
  }

  if (/hero.*bento|bento.*hero/i.test(proposal.moment)) {
    warnings.push("Momento genérico hero+bento");
  }

  return {
    pass: blocks.length === 0,
    warnings,
    blocks,
    suggestions,
  };
}