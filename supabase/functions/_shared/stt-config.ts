/** Sync com src/lib/stt-config.ts — modelos STT fixos por provedor. */
export type SttProviderId = "grok" | "groq" | "openrouter";

export const STT_MODEL_BY_PROVIDER: Record<SttProviderId, string> = {
  groq: "whisper-large-v3-turbo",
  grok: "grok-voice-stt",
  openrouter: "openai/whisper-large-v3",
};
