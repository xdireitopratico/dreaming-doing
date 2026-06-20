/**
 * Design Critic — auto-cheque estruturado antes do primeiro patch.
 *
 * O critic valida que a síntese de design é coerente, que o gesto-memorável
 * é específico (não genérico), que as técnicas servem ao momento, e que
 * nenhum anti-padrão foi violado sem justificativa.
 *
 * O critic é DETERMINÍSTICO — regras concretas, não wishful thinking.
 * O LLM preenche o checklist no plan; o critic valida.
 */

import { VISUAL_LANGUAGES, isVisualLanguage } from "../tokens/languages";
import { TECHNIQUE_BY_ID } from "../techniques";
import type { SynthesisProposal } from "../synthesis/engine";

export interface CriticCheck {
  id: string;
  question: string;
  required: boolean;
}

export interface CriticResult {
  pass: boolean;
  warnings: string[];
  blocks: string[];
  suggestions: string[];
}

export const DESIGN_AUTO_CHECK: CriticCheck[] = [
  {
    id: "synthesis_coherent",
    question: "A síntese voice[0]+voice[1] tem alma unificada ou é colagem sem intenção?",
    required: true,
  },
  {
    id: "moment_specific",
    question: "O gesto-memorável é específico do domínio ou genérico (ex: 'hero+bento')?",
    required: true,
  },
  {
    id: "technique_justified",
    question: "A técnica dominante serve ao momento-memorável ou é decorativa?",
    required: true,
  },
  {
    id: "anti_patterns_clear",
    question: "Nenhum anti-padrão da blacklist foi violado sem justificativa explícita?",
    required: true,
  },
  {
    id: "pastiche_risk",
    question: "Risco de pastiche (mistura sem alma)? Se sim, refazer brief.",
    required: true,
  },
];

/** Lista de anti-padrões globais — o critic verifica contra estes. */
export const GLOBAL_ANTI_PATTERNS = [
  "hero centralizado com 3 cards simétricos",
  "gradiente violeta-índigo",
  "glassmorphism sobre fundo chapado",
  "Inter peso medium sem variação",
  "rounded-full + glow sem motivo",
];

/**
 * Valida uma proposta de síntese contra regras estruturais.
 */
export function reviewSynthesis(proposal: SynthesisProposal): CriticResult {
  const warnings: string[] = [];
  const blocks: string[] = [];
  const suggestions: string[] = [];

  // 1. Verifica que as linguagens existem e combinam
  for (const langId of proposal.voice) {
    if (!isVisualLanguage(langId)) {
      blocks.push(`Linguagem "${langId}" não existe no léxico. Use uma das: ${Object.keys(VISUAL_LANGUAGES).join(", ")}`);
    }
  }

  // 2. Verifica conflitos entre linguagens
  for (let i = 0; i < proposal.voice.length; i++) {
    for (let j = i + 1; j < proposal.voice.length; j++) {
      const l1 = VISUAL_LANGUAGES[proposal.voice[i]];
      const l2 = VISUAL_LANGUAGES[proposal.voice[j]];
      if (l1?.conflicts_with.includes(proposal.voice[j])) {
        blocks.push(`${l1.name} CONFLITA com ${l2?.name}. Esta combinação produz Frankenstein, não síntese.`);
      }
    }
  }

  // 3. Verifica que o momento é específico (não genérico)
  const momentLower = proposal.moment.toLowerCase();
  const genericMoments = ["hero+bento", "hero e bento", "hero centralizado", "features grid", "3 cards"];
  for (const generic of genericMoments) {
    if (momentLower.includes(generic)) {
      blocks.push(`Momento-memorável parece genérico ("${generic}"). Seja específico do domínio — declare a assinatura concreta.`);
    }
  }

  // 4. Verifica que as técnicas existem
  for (const techId of proposal.techniques) {
    if (!TECHNIQUE_BY_ID[techId]) {
      warnings.push(`Técnica "${techId}" não existe no catálogo @forge/ui. Verifique o ID.`);
    }
  }

  // 5. Verifica compatibilidade de mood com linguagens
  for (const langId of proposal.voice) {
    const lang = VISUAL_LANGUAGES[langId];
    if (lang && !lang.compatible_moods.includes(proposal.mood)) {
      warnings.push(
        `Mood "${proposal.mood}" não está na lista de moods compatíveis com ${lang.name} (${langId}). ` +
          `Moods compatíveis: ${lang.compatible_moods.join(", ")}. Pode funcionar, mas verifique coerência.`,
      );
    }
  }

  // 6. Sugestões proativas
  if (proposal.techniques.length === 0) {
    suggestions.push("Nenhuma técnica selecionada. Considere adicionar 2-4 técnicas do catálogo @forge/ui para elevar o design.");
  } else if (proposal.techniques.length > 4) {
    warnings.push(`${proposal.techniques.length} técnicas selecionadas — máximo recomendado é 4. Mais que isso vira poluição visual.`);
  }

  if (proposal.voice.length === 1) {
    suggestions.push("Apenas 1 linguagem no voice. Considere combinar 2 para síntese mais rica (ver combines_with no léxico).");
  }

  if (proposal.confidence < 0.6) {
    warnings.push(`Confiança baixa (${(proposal.confidence * 100).toFixed(0)}%). Considere ajustar o voice ou adicionar referências via web_research.`);
  }

  return {
    pass: blocks.length === 0,
    warnings,
    blocks,
    suggestions,
  };
}

/**
 * Formata o resultado do critic para o prompt do LLM.
 */
export function criticSummary(result: CriticResult): string {
  const lines: string[] = [];

  lines.push(`## Design Critic — Auto-cheque`);
  lines.push(`Status: ${result.pass ? "PASS" : "BLOCK"}`);
  lines.push("");

  if (result.blocks.length > 0) {
    lines.push("**BLOQUEIOS (corrija antes de construir):**");
    for (const b of result.blocks) lines.push(`- ${b}`);
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push("**Avisos:**");
    for (const w of result.warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  if (result.suggestions.length > 0) {
    lines.push("**Sugestões:**");
    for (const s of result.suggestions) lines.push(`- ${s}`);
  }

  return lines.join("\n");
}

/**
 * Checklist para o LLM preencher no plan.
 * O agente deve responder a cada item explicitamente.
 */
export function criticChecklistForPrompt(): string {
  return DESIGN_AUTO_CHECK.map((check, i) => {
    return `${i + 1}. [${check.required ? "OBRIGATÓRIO" : "OPCIONAL"}] ${check.question}`;
  }).join("\n");
}
