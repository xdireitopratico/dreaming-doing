/** Preferências de modelo/potência — persistidas localmente (sem expor chaves). */
import { getPresetById, normalizePresetId } from "@/lib/model-catalog";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";

export type ModelPowerMode = "auto" | "robin" | "fixed";

export type PoolProviderId = "nvidia" | "groq";

export type SttProviderId = "grok" | "groq" | "openrouter";

export interface AgentPreferences {
  mode?: ModelPowerMode;
  /** Preset do catálogo quando mode === "fixed" */
  fixedPresetId?: string;
  /** Provedor do pool quando mode === "robin" */
  poolProvider?: PoolProviderId;
  /** Preset do modelo no pool */
  robinPoolModelId?: string;
  /** STT no microfone */
  sttProvider?: SttProviderId;
  /** ID exato na API (OpenRouter slug, etc.) — sobrescreve o preset quando useCustomModel */
  customModelId?: string;
  useCustomModel?: boolean;
  /** Presets ocultos na biblioteca (botão ×) — o modelo ativo não é removido automaticamente */
  hiddenPresetIds?: string[];
}

const STORAGE_KEY = "forge:agent-preferences";

/** Estado vazio — nenhum default de modelo/modo. */
export const EMPTY_AGENT_PREFERENCES: AgentPreferences = {};

export function loadAgentPreferences(): AgentPreferences {
  if (typeof window === "undefined") return EMPTY_AGENT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_AGENT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AgentPreferences> & { mode?: string };
    const modeRaw =
      (parsed.mode as string) === "rob" ? "robin" : parsed.mode;
    const mode =
      modeRaw === "robin" || modeRaw === "fixed" || modeRaw === "auto" ? modeRaw : undefined;

    return {
      mode,
      poolProvider: parsed.poolProvider,
      sttProvider: parsed.sttProvider,
      customModelId: parsed.customModelId,
      useCustomModel: parsed.useCustomModel,
      fixedPresetId: parsed.fixedPresetId
        ? normalizePresetId(parsed.fixedPresetId)
        : undefined,
      robinPoolModelId: parsed.robinPoolModelId
        ? normalizePresetId(parsed.robinPoolModelId)
        : undefined,
      hiddenPresetIds: Array.isArray(parsed.hiddenPresetIds)
        ? parsed.hiddenPresetIds.filter((x): x is string => typeof x === "string")
        : undefined,
    };
  } catch {
    return EMPTY_AGENT_PREFERENCES;
  }
}

export function saveAgentPreferences(prefs: AgentPreferences) {
  if (typeof window === "undefined") return;
  const normalized: AgentPreferences = {
    ...prefs,
    fixedPresetId: prefs.fixedPresetId
      ? normalizePresetId(prefs.fixedPresetId)
      : undefined,
    robinPoolModelId: prefs.robinPoolModelId
      ? normalizePresetId(prefs.robinPoolModelId)
      : undefined,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new Event("forge:prefs-updated"));
}

/** Label curto para o chip do editor conforme o modo ativo. */
export function agentModeLabel(prefs: AgentPreferences): string {
  if (!isAgentPreferencesConfigured(prefs)) return "setup pendente";
  if (prefs.mode === "robin") {
    const preset = getPresetById(prefs.robinPoolModelId);
    return `ROBIN · ${preset.label}`;
  }
  if (prefs.mode === "fixed") {
    return getPresetById(prefs.fixedPresetId).label;
  }
  return "não configurado";
}