/** Preferências de modelo/potência — persistidas no banco (antes localStorage). */
import { supabase } from "@/integrations/supabase/client";
import {
  getPresetById,
  inferEnvFromSlug,
  normalizePresetId,
  type UserModelEntry,
  userModelPresetId,
} from "@/lib/model-catalog";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";

export type ModelPowerMode = "auto" | "robin" | "fixed";

export type PoolProviderId = string;

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

function normalizePrefs(raw: Partial<AgentPreferences> & { mode?: string }): AgentPreferences {
  const modeRaw = (raw.mode as string) === "rob" ? "robin" : raw.mode;
  const mode =
    modeRaw === "robin" || modeRaw === "fixed" || modeRaw === "auto" ? modeRaw : undefined;
  return {
    mode,
    poolProvider: raw.poolProvider,
    sttProvider: raw.sttProvider,
    customModelId: raw.customModelId,
    useCustomModel: raw.useCustomModel,
    fixedPresetId: raw.fixedPresetId ? normalizePresetId(raw.fixedPresetId) : undefined,
    robinPoolModelId: raw.robinPoolModelId
      ? normalizePresetId(raw.robinPoolModelId)
      : undefined,
    hiddenPresetIds: Array.isArray(raw.hiddenPresetIds)
      ? raw.hiddenPresetIds.filter((x): x is string => typeof x === "string")
      : undefined,
    autoAllowedPresetIds: Array.isArray(raw.autoAllowedPresetIds)
      ? raw.autoAllowedPresetIds
          .filter((x): x is string => typeof x === "string")
          .map(normalizePresetId)
      : undefined,
    userModelEntries: normalizeUserModelEntries(raw),
  };
}

/** Load do banco (com fallback localStorage durante migração). */
export async function loadAgentPreferencesFromDb(): Promise<AgentPreferences> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return loadAgentPreferences();

    const { data, error } = await supabase
      .from("profiles")
      .select("agent_preferences")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;

    const raw = (data as Record<string, unknown> | null)?.agent_preferences;
    if (raw && typeof raw === "object") {
      const parsed = normalizePrefs(raw as Partial<AgentPreferences> & { mode?: string });

      // Manter localStorage sincronizado com DB para leituras síncronas
      saveAgentPreferences(parsed);

      return parsed;
    }

    // Migrar localStorage → banco se há dados locais e DB está vazio
    const local = loadAgentPreferences();
    if (local.mode) {
      await saveAgentPreferencesToDb(local);
    }
    return local;
  } catch {
    return loadAgentPreferences();
  }
}

/** Save no banco (dual-write localStorage como cache síncrono). */
export async function saveAgentPreferencesToDb(prefs: AgentPreferences): Promise<void> {
  const normalized: AgentPreferences = {
    ...prefs,
    fixedPresetId: prefs.fixedPresetId ? normalizePresetId(prefs.fixedPresetId) : undefined,
    robinPoolModelId: prefs.robinPoolModelId
      ? normalizePresetId(prefs.robinPoolModelId)
      : undefined,
  };

  // Sempre salvar no localStorage (cache síncrono)
  saveAgentPreferences(normalized);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("profiles")
      .update({ agent_preferences: normalized as unknown as Record<string, unknown> } as never)
      .eq("id", user.id);
  } catch (e) {
    console.warn("Falha ao salvar agent_preferences no banco:", e);
  }
}

/** Load síncrono do localStorage (fallback). */
export function loadAgentPreferences(): AgentPreferences {
  if (typeof window === "undefined") return EMPTY_AGENT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_AGENT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AgentPreferences> & { mode?: string };
    return normalizePrefs(parsed);
  } catch {
    return EMPTY_AGENT_PREFERENCES;
  }
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
