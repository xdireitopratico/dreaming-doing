/** Preferências de modelo/potência — persistidas localmente (sem expor chaves). */
import { getPresetById, normalizePresetId } from "@/lib/model-catalog";

export type ModelPowerMode = "auto" | "robin" | "fixed";

export type PoolProviderId = "nvidia" | "groq";

export type SttProviderId = "grok" | "groq";

export interface AgentPreferences {
  mode: ModelPowerMode;
  /** Preset do catálogo quando mode === "fixed" */
  fixedPresetId?: string;
  /** Provedor do pool quando mode === "robin" */
  poolProvider?: PoolProviderId;
  /** Preset do modelo no pool (ex.: nvidia-llama70, groq-llama70) */
  robinPoolModelId?: string;
  /** STT no microfone */
  sttProvider?: SttProviderId;
  /** ID exato na API (OpenRouter slug, etc.) — sobrescreve o preset quando useCustomModel */
  customModelId?: string;
  useCustomModel?: boolean;
}

const STORAGE_KEY = "forge:agent-preferences";

export const DEFAULT_AGENT_PREFERENCES: AgentPreferences = {
  mode: "fixed",
  fixedPresetId: "anthropic-sonnet",
  poolProvider: "groq",
  robinPoolModelId: "groq-llama70",
  sttProvider: "grok",
};

export function loadAgentPreferences(): AgentPreferences {
  if (typeof window === "undefined") return DEFAULT_AGENT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AGENT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Omit<AgentPreferences, "mode">> & { mode?: string };
    const modeRaw = parsed.mode === "rob" ? "robin" : parsed.mode;
    const merged: AgentPreferences = {
      ...DEFAULT_AGENT_PREFERENCES,
      ...parsed,
      mode:
        modeRaw === "robin" || modeRaw === "fixed" || modeRaw === "auto"
          ? modeRaw
          : "auto",
      fixedPresetId: normalizePresetId(parsed.fixedPresetId),
      robinPoolModelId: parsed.robinPoolModelId
        ? normalizePresetId(parsed.robinPoolModelId)
        : DEFAULT_AGENT_PREFERENCES.robinPoolModelId,
    };
    return merged;
  } catch {
    return DEFAULT_AGENT_PREFERENCES;
  }
}

export function saveAgentPreferences(prefs: AgentPreferences) {
  if (typeof window === "undefined") return;
  const normalized: AgentPreferences = {
    ...prefs,
    fixedPresetId: normalizePresetId(prefs.fixedPresetId),
    robinPoolModelId: normalizePresetId(prefs.robinPoolModelId),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new Event("forge:prefs-updated"));
}

/** Label curto para o chip do editor conforme o modo ativo. */
export function agentModeLabel(prefs: AgentPreferences): string {
  if (prefs.mode === "robin") {
    const preset = getPresetById(prefs.robinPoolModelId);
    return `ROBIN · ${preset.label}`;
  }
  if (prefs.mode === "fixed") {
    return getPresetById(prefs.fixedPresetId).label;
  }
  return "Router automático";
}