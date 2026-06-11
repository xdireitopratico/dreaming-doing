/** Preferências de modelo/potência — persistidas localmente (sem expor chaves). */
import {
  getPresetById,
  inferEnvFromSlug,
  normalizePresetId,
  type UserModelEntry,
  userModelPresetId,
} from "@/lib/model-catalog";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";

export type ModelPowerMode = "auto" | "robin" | "fixed";

export type PoolProviderId = "nvidia" | "groq";

export type { SttProviderId } from "@/lib/stt-config";
import type { SttProviderId } from "@/lib/stt-config";

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
  /** Modo Auto: modelos que o router pode usar (vazio = todos com chave ativa) */
  autoAllowedPresetIds?: string[];
  /** Slugs que o usuário adicionou manualmente (passo 4) */
  userModelEntries?: UserModelEntry[];
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
    const modeRaw = (parsed.mode as string) === "rob" ? "robin" : parsed.mode;
    const mode =
      modeRaw === "robin" || modeRaw === "fixed" || modeRaw === "auto" ? modeRaw : undefined;

    return {
      mode,
      poolProvider: parsed.poolProvider,
      sttProvider: parsed.sttProvider,
      customModelId: parsed.customModelId,
      useCustomModel: parsed.useCustomModel,
      fixedPresetId: parsed.fixedPresetId ? normalizePresetId(parsed.fixedPresetId) : undefined,
      robinPoolModelId: parsed.robinPoolModelId
        ? normalizePresetId(parsed.robinPoolModelId)
        : undefined,
      hiddenPresetIds: Array.isArray(parsed.hiddenPresetIds)
        ? parsed.hiddenPresetIds.filter((x): x is string => typeof x === "string")
        : undefined,
      autoAllowedPresetIds: Array.isArray(parsed.autoAllowedPresetIds)
        ? parsed.autoAllowedPresetIds
            .filter((x): x is string => typeof x === "string")
            .map(normalizePresetId)
        : undefined,
      userModelEntries: normalizeUserModelEntries(parsed),
    };
  } catch {
    return EMPTY_AGENT_PREFERENCES;
  }
}

function normalizeUserModelEntries(
  parsed: Partial<AgentPreferences> & { customModelId?: string; useCustomModel?: boolean },
): UserModelEntry[] | undefined {
  const fromField = Array.isArray(parsed.userModelEntries)
    ? parsed.userModelEntries
        .filter(
          (e): e is UserModelEntry =>
            !!e && typeof e.slug === "string" && typeof e.env === "string",
        )
        .map((e) => ({
          slug: e.slug.trim(),
          env: e.env,
          label: typeof e.label === "string" ? e.label.trim() : undefined,
        }))
    : [];

  if (fromField.length > 0) return fromField;

  const legacy = parsed.customModelId?.trim();
  if (legacy && parsed.useCustomModel) {
    return [{ slug: legacy, env: inferEnvFromSlug(legacy), label: legacy }];
  }
  return fromField.length > 0 ? fromField : undefined;
}

export function saveAgentPreferences(prefs: AgentPreferences) {
  if (typeof window === "undefined") return;
  const normalized: AgentPreferences = {
    ...prefs,
    fixedPresetId: prefs.fixedPresetId ? normalizePresetId(prefs.fixedPresetId) : undefined,
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
    const preset = getPresetById(prefs.robinPoolModelId, prefs.userModelEntries);
    return `ROBIN · ${preset.label}`;
  }
  if (prefs.mode === "fixed") {
    return getPresetById(prefs.fixedPresetId, prefs.userModelEntries).label;
  }
  return "não configurado";
}
