/** Preferências de modelo/potência — persistidas localmente (sem expor chaves). */
export type ModelPowerMode = "auto" | "robin" | "fixed";

export type PoolProviderId = "nvidia" | "groq";

export interface AgentPreferences {
  mode: ModelPowerMode;
  /** Preset do ProviderSelector quando mode === "fixed" */
  fixedPresetId?: string;
  /** Provedor do pool de chaves quando mode === "robin" */
  poolProvider?: PoolProviderId;
}

const STORAGE_KEY = "forge:agent-preferences";

export const DEFAULT_AGENT_PREFERENCES: AgentPreferences = {
  mode: "auto",
  fixedPresetId: "anthropic-sonnet",
  poolProvider: "groq",
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
}