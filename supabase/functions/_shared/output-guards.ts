/**
 * Output Guards — Configurable guardrails for agent outputs (Round 44)
 * 
 * Rules:
 * - pii_mask: Mask CPF, email, phone numbers (LGPD compliance)
 * - legal_disclaimer: Append OAB disclaimer for legal content
 * - no_guarantee: Strip guarantee/promise language
 * - max_length: Truncate output to configurable max chars
 * - toxicity: Block toxic/offensive content via keyword detection
 * - confidentiality: Remove mentions of internal systems/prompts
 * - regex_filter: Custom regex patterns to match & replace
 * - keyword_blacklist: Block specific keywords/phrases
 * 
 * @version 1.0.0
 */

import { maskPII } from "./dr-pratico-v2-shared/pii-mask.ts";

export interface GuardRule {
  id: string;
  enabled: boolean;
  /** Custom config per rule */
  config?: Record<string, any>;
}

export interface GuardConfig {
  enabled: boolean;
  rules: GuardRule[];
}

export interface GuardResult {
  original_text: string;
  filtered_text: string;
  rules_applied: string[];
  rules_blocked: string[];
  was_modified: boolean;
  was_blocked: boolean;
  block_reason?: string;
}

// Default toxic keywords (PT-BR + EN)
const DEFAULT_TOXIC_KEYWORDS = [
  "vai se foder", "filho da puta", "desgraçado", "vai tomar no cu",
  "fuck you", "kill yourself", "die", "idiot",
];

// Confidentiality patterns — references to internal systems
const CONFIDENTIALITY_PATTERNS = [
  /meu prompt (é|diz|instrui)/gi,
  /system prompt/gi,
  /minhas instruções internas/gi,
  /aqui está meu prompt/gi,
  /I was instructed to/gi,
  /my system instructions/gi,
];

const LEGAL_DISCLAIMER_PT = "\n\n⚠️ *Aviso Legal:* Este conteúdo é meramente informativo e não constitui aconselhamento jurídico. Consulte um advogado para orientação sobre seu caso específico.";
const LEGAL_DISCLAIMER_EN = "\n\n⚠️ *Legal Notice:* This content is for informational purposes only and does not constitute legal advice. Consult a lawyer for guidance on your specific case.";

const NO_GUARANTEE_PATTERNS = [
  /garant(o|imos|ido) que/gi,
  /com certeza (vai|será|terá)/gi,
  /prometo que/gi,
  /sem dúvida (vai|será)/gi,
  /100% (certo|garantido|seguro)/gi,
  /I guarantee/gi,
  /I promise/gi,
  /guaranteed to/gi,
];

/**
 * Apply all enabled output guards to text
 */
export function applyOutputGuards(text: string, config: GuardConfig): GuardResult {
  if (!config.enabled || !config.rules?.length) {
    return {
      original_text: text,
      filtered_text: text,
      rules_applied: [],
      rules_blocked: [],
      was_modified: false,
      was_blocked: false,
    };
  }

  let filtered = text;
  const rulesApplied: string[] = [];
  const rulesBlocked: string[] = [];
  let blocked = false;
  let blockReason: string | undefined;

  for (const rule of config.rules) {
    if (!rule.enabled) continue;

    switch (rule.id) {
      case "pii_mask": {
        const before = filtered;
        filtered = maskPII(filtered);
        if (filtered !== before) rulesApplied.push("pii_mask");
        break;
      }

      case "legal_disclaimer": {
        const lang = rule.config?.language || "pt";
        const disclaimer = lang === "en" ? LEGAL_DISCLAIMER_EN : LEGAL_DISCLAIMER_PT;
        if (!filtered.includes("⚠️")) {
          filtered += disclaimer;
          rulesApplied.push("legal_disclaimer");
        }
        break;
      }

      case "no_guarantee": {
        const before = filtered;
        for (const pattern of NO_GUARANTEE_PATTERNS) {
          filtered = filtered.replace(pattern, (match) => {
            return match.replace(/garant|prometo|certeza|guarantee|promise/gi, "pode ser possível");
          });
        }
        if (filtered !== before) rulesApplied.push("no_guarantee");
        break;
      }

      case "max_length": {
        const maxLen = rule.config?.max_chars || 2000;
        if (filtered.length > maxLen) {
          filtered = filtered.substring(0, maxLen) + "...";
          rulesApplied.push("max_length");
        }
        break;
      }

      case "toxicity": {
        const keywords = rule.config?.keywords || DEFAULT_TOXIC_KEYWORDS;
        const lowerText = filtered.toLowerCase();
        for (const kw of keywords) {
          if (lowerText.includes(kw.toLowerCase())) {
            blocked = true;
            blockReason = `Conteúdo bloqueado por regra de toxicidade: padrão detectado`;
            rulesBlocked.push("toxicity");
            break;
          }
        }
        if (!blocked) rulesApplied.push("toxicity");
        break;
      }

      case "confidentiality": {
        const before = filtered;
        for (const pattern of CONFIDENTIALITY_PATTERNS) {
          filtered = filtered.replace(pattern, "[informação confidencial]");
        }
        if (filtered !== before) rulesApplied.push("confidentiality");
        break;
      }

      case "regex_filter": {
        const patterns = rule.config?.patterns || [];
        const before = filtered;
        for (const p of patterns) {
          try {
            const regex = new RegExp(p.pattern, p.flags || "gi");
            filtered = filtered.replace(regex, p.replacement || "[filtrado]");
          } catch { /* invalid regex — skip */ }
        }
        if (filtered !== before) rulesApplied.push("regex_filter");
        break;
      }

      case "keyword_blacklist": {
        const blacklist: string[] = rule.config?.keywords || [];
        const before = filtered;
        for (const keyword of blacklist) {
          const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          filtered = filtered.replace(new RegExp(escaped, "gi"), "[***]");
        }
        if (filtered !== before) rulesApplied.push("keyword_blacklist");
        break;
      }
    }

    if (blocked) break;
  }

  if (blocked) {
    filtered = blockReason || "Conteúdo bloqueado pelos filtros de segurança.";
  }

  return {
    original_text: text,
    filtered_text: filtered,
    rules_applied: rulesApplied,
    rules_blocked: rulesBlocked,
    was_modified: filtered !== text,
    was_blocked: blocked,
    block_reason: blockReason,
  };
}

/**
 * Get default guard config for a new flow
 */
export function getDefaultGuardConfig(): GuardConfig {
  return {
    enabled: true,
    rules: [
      { id: "pii_mask", enabled: true },
      { id: "legal_disclaimer", enabled: false, config: { language: "pt" } },
      { id: "no_guarantee", enabled: false },
      { id: "max_length", enabled: true, config: { max_chars: 2000 } },
      { id: "toxicity", enabled: true },
      { id: "confidentiality", enabled: true },
      { id: "regex_filter", enabled: false, config: { patterns: [] } },
      { id: "keyword_blacklist", enabled: false, config: { keywords: [] } },
    ],
  };
}

/** All available guard rule definitions (for UI) */
export const GUARD_RULE_DEFINITIONS = [
  { id: "pii_mask", label: "PII Mask (LGPD)", description: "Mascara CPF, email e telefone", category: "compliance" },
  { id: "legal_disclaimer", label: "Aviso Legal (OAB)", description: "Insere disclaimer jurídico no final", category: "compliance" },
  { id: "no_guarantee", label: "Sem Garantias", description: "Remove linguagem de garantia/promessa", category: "compliance" },
  { id: "max_length", label: "Limite de Tamanho", description: "Trunca resposta no máximo configurado", category: "safety" },
  { id: "toxicity", label: "Filtro Toxicidade", description: "Bloqueia conteúdo tóxico/ofensivo", category: "safety" },
  { id: "confidentiality", label: "Confidencialidade", description: "Remove referências a prompts internos", category: "safety" },
  { id: "regex_filter", label: "Regex Custom", description: "Padrões regex personalizados", category: "custom" },
  { id: "keyword_blacklist", label: "Blacklist Palavras", description: "Bloqueia palavras específicas", category: "custom" },
];
