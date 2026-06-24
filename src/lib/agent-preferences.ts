/** Preferências de modelo — SSOT: profiles.agent_preferences (Postgres). */
import { supabase } from "@/integrations/supabase/client";
import {
  getPresetById,
  inferEnvFromSlug,
  normalizePresetId,
  type UserModelEntry,
} from "@/lib/model-catalog";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";
import {
  clearAgentPreferencesCache,
  getAgentPreferencesCache,
  isAgentPreferencesHydrated,
  setAgentPreferencesCache,
} from "@/lib/agent-preferences-store";

export type ModelPowerMode = "auto" | "robin" | "fixed";

export type PoolProviderId = string;

export type { SttProviderId } from "@/lib/stt-config";
import type { SttProviderId } from "@/lib/stt-config";

export interface AgentPreferences {
  mode?: ModelPowerMode;
  fixedPresetId?: string;
  poolProvider?: PoolProviderId;
  robinPoolModelId?: string;
  sttProvider?: SttProviderId;
  parserProvider?: string;
  customModelId?: string;
  useCustomModel?: boolean;
  hiddenPresetIds?: string[];
  autoAllowedPresetIds?: string[];
  userModelEntries?: UserModelEntry[];
}

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

export function normalizeAgentPreferences(
  raw: Partial<AgentPreferences> & { mode?: string },
): AgentPreferences {
  const modeRaw = (raw.mode as string) === "rob" ? "robin" : raw.mode;
  const mode =
    modeRaw === "robin" || modeRaw === "fixed" || modeRaw === "auto" ? modeRaw : undefined;
  return {
    mode,
    poolProvider: raw.poolProvider,
    sttProvider: raw.sttProvider,
    parserProvider: typeof raw.parserProvider === "string" ? raw.parserProvider : undefined,
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

/** Carrega do banco e atualiza cache em memória. Fail-closed: {} se vazio. */
export async function loadAgentPreferencesFromDb(): Promise<AgentPreferences> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    clearAgentPreferencesCache();
    return EMPTY_AGENT_PREFERENCES;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("agent_preferences")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar preferências: ${error.message}`);

  const raw = (data as Record<string, unknown> | null)?.agent_preferences;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    setAgentPreferencesCache(EMPTY_AGENT_PREFERENCES);
    return EMPTY_AGENT_PREFERENCES;
  }

  const parsed = normalizeAgentPreferences(raw as Partial<AgentPreferences> & { mode?: string });
  setAgentPreferencesCache(parsed);
  return parsed;
}

/** Sempre fresco do banco — usado ao disparar agent-run. */
export async function loadAgentPreferencesForAgentRun(): Promise<AgentPreferences> {
  return loadAgentPreferencesFromDb();
}

export async function hydrateAgentPreferences(): Promise<AgentPreferences> {
  return loadAgentPreferencesFromDb();
}

/** Leitura síncrona do cache (após hydrate). Fail-closed se não hidratado. */
export function loadAgentPreferences(): AgentPreferences {
  if (!isAgentPreferencesHydrated()) return EMPTY_AGENT_PREFERENCES;
  return getAgentPreferencesCache();
}

export async function saveAgentPreferencesToDb(prefs: AgentPreferences): Promise<void> {
  const normalized = normalizeAgentPreferences(prefs);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { error } = await supabase
    .from("profiles")
    .update({ agent_preferences: normalized as unknown as Record<string, unknown> } as never)
    .eq("id", user.id);

  if (error) throw new Error(`Falha ao salvar preferências: ${error.message}`);

  setAgentPreferencesCache(normalized);
}

/** @deprecated Use saveAgentPreferencesToDb */
export function saveAgentPreferences(prefs: AgentPreferences) {
  void saveAgentPreferencesToDb(prefs);
}

export function agentModeLabel(prefs: AgentPreferences): string {
  if (!isAgentPreferencesConfigured(prefs)) return "setup pendente";
  if (prefs.mode === "robin") {
    const preset = getPresetById(prefs.robinPoolModelId, prefs.userModelEntries);
    return `ROBIN · ${preset.label}`;
  }
  if (prefs.mode === "fixed") {
    return getPresetById(prefs.fixedPresetId, prefs.userModelEntries).label;
  }
  if (prefs.mode === "auto") return "Automático";
  return "não configurado";
}
