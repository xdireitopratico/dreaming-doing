/** STT — três provedores, um modelo fixo cada (sem picker de modelo). */
export type SttProviderId = "grok" | "groq" | "openrouter";

/** Padrão: Groq Whisper Turbo (custo-benefício). */
export const STT_DEFAULT_PROVIDER: SttProviderId = "groq";

export type SttOption = {
  id: SttProviderId;
  label: string;
  description: string;
  modelId: string;
  requiresEnv: import("@/lib/model-catalog").AiEnvId;
  recommended?: boolean;
};

export const STT_OPTIONS: SttOption[] = [
  {
    id: "groq",
    label: "Groq · Whisper Large v3 Turbo",
    description: "Padrão recomendado. Modelo fixo: whisper-large-v3-turbo.",
    modelId: "whisper-large-v3-turbo",
    requiresEnv: "groq",
    recommended: true,
  },
  {
    id: "grok",
    label: "xAI · Grok Voice STT",
    description: "Melhor para português. A xAI escolhe o modelo na API (sem lista manual).",
    modelId: "xai-stt",
    requiresEnv: "xai",
  },
  {
    id: "openrouter",
    label: "OpenRouter · Whisper Large v3",
    description: "Requer créditos OpenRouter. Modelo fixo: openai/whisper-large-v3.",
    modelId: "openai/whisper-large-v3",
    requiresEnv: "openrouter",
  },
];

export const STT_MODEL_BY_PROVIDER: Record<SttProviderId, string> = {
  groq: "whisper-large-v3-turbo",
  grok: "xai-stt",
  openrouter: "openai/whisper-large-v3",
};

export const STT_LABELS: Record<SttProviderId, string> = {
  grok: "xAI · Grok Voice STT",
  groq: "Groq · Whisper v3 Turbo",
  openrouter: "OpenRouter · Whisper v3",
};