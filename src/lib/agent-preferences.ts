/** Preferências de modelo/potência — persistidas localmente (sem expor chaves). */
export type ModelPowerMode = "auto" | "robin" | "fixed";

export type PoolProviderId = "nvidia" | "groq";

export type SttProviderId = "grok" | "groq";

export interface AgentPreferences {
  mode: ModelPowerMode;
  /** Preset do ProviderSelector quando mode === "fixed" */
  fixedPresetId?: string;
  /** Provedor do pool de chaves quando mode === "robin" */
  poolProvider?: PoolProviderId;
  /** STT no microfone: Grok (xAI) ou Groq Whisper */
  sttProvider?: SttProviderId;
}

const STORAGE_KEY = "forge:agent-preferences";

export const DEFAULT_AGENT_PREFERENCES: AgentPreferences = {
  mode: "auto",
  fixedPresetId: "anthropic-sonnet",
  poolProvider: "groq",
  sttProvider: "grok",
};

export function loadAgentPreferences(): AgentPreferences {
  if (typeof window === "undefined") return DEFAULT_AGENT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AGENT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AgentPreferences> & { mode?: string };
    const modeRaw = parsed.mode === "rob" ? "robin" : parsed.mode;
    return {
      ...DEFAULT_AGENT_PREFERENCES,
      ...parsed,
      mode:
        modeRaw === "robin" || modeRaw === "fixed" || modeRaw === "auto"
          ? modeRaw
          : "auto",
    };
  } catch {
    return DEFAULT_AGENT_PREFERENCES;
  }
}

export function saveAgentPreferences(prefs: AgentPreferences) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event("forge:prefs-updated"));
}

/** Label curto para o chip do editor conforme o modo ativo. */
export function agentModeLabel(prefs: AgentPreferences): string {
  if (prefs.mode === "robin") {
    const p = prefs.poolProvider === "nvidia" ? "NVIDIA NIM" : "Groq";
    return `ROBIN · ${p}`;
  }
  if (prefs.mode === "fixed") {
    const id = prefs.fixedPresetId ?? "anthropic-sonnet";
    const names: Record<string, string> = {
      "anthropic-sonnet": "Claude Sonnet 4",
      "xai-grok": "Grok 3 Mini",
      "groq-llama": "Llama 4 Scout",
      "openai-gpt4o": "GPT-4o",
    };
    return names[id] ?? "Modelo fixo";
  }
  return "Router automático";
}