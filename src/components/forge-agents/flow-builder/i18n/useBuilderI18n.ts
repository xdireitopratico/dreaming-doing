/**
 * AetherForge Builder i18n Hook
 * Rodada 30: Multi-Language + i18n
 */
import { useState, useCallback, useMemo } from "react";
import { translations, LOCALE_LABELS, LOCALE_FLAGS, type Locale, type TranslationKeys } from "./locales";

const STORAGE_KEY = "aetherforge_builder_locale";

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in translations) return stored as Locale;
  } catch {}
  // Detect from browser
  const lang = navigator.language;
  if (lang.startsWith("pt")) return "pt-BR";
  if (lang.startsWith("es")) return "es";
  return "en";
}

export function useBuilderI18n() {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);

  const t = useMemo(() => translations[locale], [locale]);

  return { locale, setLocale, t, LOCALE_LABELS, LOCALE_FLAGS };
}

/**
 * Detect language of a text string (simple heuristic)
 * For production, use an LLM or dedicated API
 */
export function detectLanguage(text: string): Locale {
  const lower = text.toLowerCase();
  
  // Portuguese indicators
  const ptWords = ["você", "não", "também", "está", "são", "como", "porque", "então", "aqui", "obrigado", "por favor", "preciso"];
  const ptScore = ptWords.filter(w => lower.includes(w)).length;
  
  // Spanish indicators
  const esWords = ["usted", "también", "está", "porque", "entonces", "aquí", "gracias", "por favor", "necesito", "cómo", "cuándo"];
  const esScore = esWords.filter(w => lower.includes(w)).length;
  
  // English indicators
  const enWords = ["you", "the", "and", "this", "that", "have", "please", "thank", "need", "want", "because", "should"];
  const enScore = enWords.filter(w => lower.includes(w)).length;

  if (ptScore >= esScore && ptScore >= enScore && ptScore > 0) return "pt-BR";
  if (esScore >= ptScore && esScore >= enScore && esScore > 0) return "es";
  return "en";
}

/**
 * Get system prompt language instruction for an agent
 */
export function getLanguageInstruction(locale: Locale): string {
  const instructions: Record<Locale, string> = {
    "pt-BR": "Você DEVE responder sempre em Português do Brasil (PT-BR). Mesmo que o usuário escreva em outro idioma, responda em PT-BR.",
    en: "You MUST always respond in English. Even if the user writes in another language, respond in English.",
    es: "DEBES responder siempre en Español. Incluso si el usuario escribe en otro idioma, responde en Español.",
  };
  return instructions[locale];
}

export function getAutoDetectInstruction(): string {
  return "Detect the user's language from their message and respond in the SAME language. Support Portuguese (BR), English, and Spanish.";
}
