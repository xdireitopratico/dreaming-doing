import type { AiEnvId } from "@/lib/model-catalog";

/** STT: usuário só escolhe o provedor; o modelo é fixo no FORGE. */
export type SttProviderId = "grok" | "groq" | "openrouter";

export const STT_DEFAULT_PROVIDER: SttProviderId = "groq";

/** Modelo enviado à API de cada provedor (não expor como picker). */
export const STT_MODEL_BY_PROVIDER: Record<SttProviderId, string> = {
  groq: "whisper-large-v3-turbo",
  grok: "grok-voice-stt",
  openrouter: "openai/whisper-large-v3",
};

export type SttOption = {
  id: SttProviderId;
  /** Nome curto no card — sem slug de modelo. */
  label: string;
  hint: string;
  requiresEnv: AiEnvId;
  recommended?: boolean;
};

export const STT_OPTIONS: SttOption[] = [
  {
    id: "groq",
    label: "Groq",
    hint: "Padrão · melhor custo-benefício",
    requiresEnv: "groq",
    recommended: true,
  },
  {
    id: "grok",
    label: "xAI",
    hint: "Melhor para português",
    requiresEnv: "xai",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    hint: "Requer créditos na conta",
    requiresEnv: "openrouter",
  },
];

export function sttProviderName(id: SttProviderId): string {
  return STT_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

/** Única linha de “qual modelo está ativo” — usar em um lugar só no UI. */
export function sttActiveModelLine(id: SttProviderId): string {
  if (id === "grok") {
    return "Modelo de voz: API STT da xAI (sem escolha manual no FORGE).";
  }
  return `Modelo de voz: ${STT_MODEL_BY_PROVIDER[id]}`;
}
