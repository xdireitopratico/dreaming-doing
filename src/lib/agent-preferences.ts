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

export type ContextWindowMode = "manual" | "auto";

export type ContextWindowPrefs = {
  mode: ContextWindowMode;
  windowTokens: number;
};

export type OperationPrefs = {
  mode: "cooperative" | "hotl";
  hotlWallHours?: 24 | 48 | 72;
};

// Default somente quando o usuário ainda não gravou nenhuma janela explícita.
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 256;

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
  webSearchProvider?: string;
  webScrapeProvider?: string;
  browserRuntimeProvider?: string;
  customModelId?: string;
  useCustomModel?: boolean;
  hiddenPresetIds?: string[];
  autoAllowedPresetIds?: string[];
  userModelEntries?: UserModelEntry[];
  // Tools fallback chain — primary é o provider conectado, fallback é o segundo.
  webSearchFallback?: string;
  webScrapeFallback?: string;
  browserFallback?: string;
  contextWindow?: ContextWindowPrefs;
  /** HOTL toggle + wall — SSOT perfil; snapshot em agent_runs.meta.operation no dispatch. */
  operation?: OperationPrefs;
}

export const EMPTY_AGENT_PREFERENCES: AgentPreferences = {};

/** Slugs gravados por scripts de smoke/E2E — nunca devem poluir perfil real. */
const SMOKE_POISONED_MODEL_SLUGS = new Set([
  "cohere/north-mini-code:free",
  "nex-agi/nex-n2-pro:free",
]);

export function isSmokePoisonedUserModelEntry(entry: UserModelEntry): boolean {
  if (entry.label && /\be2e\b/i.test(entry.label)) return true;
  if (SMOKE_POISONED_MODEL_SLUGS.has(entry.slug.trim())) {
    return /\be2e\b/i.test(entry.label ?? "") || entry.label === "E2E OpenRouter free";
  }
  return false;
}

function isSmokePoisonedCustomModel(slug?: string, label?: string): boolean {
  const s = slug?.trim();
  if (!s) return false;
  if (label && /\be2e\b/i.test(label)) return true;
  return SMOKE_POISONED_MODEL_SLUGS.has(s);
}

/** Remove resíduos de smoke/E2E e estados conflitantes (fixedPresetId + useCustomModel). */
export function sanitizeSmokePoisonedPreferences(prefs: AgentPreferences): {
  prefs: AgentPreferences;
  changed: boolean;
} {
  let changed = false;
  const next: AgentPreferences = { ...prefs };

  const entries = (next.userModelEntries ?? []).filter((e) => {
    if (isSmokePoisonedUserModelEntry(e)) {
      changed = true;
      return false;
    }
    return true;
  });
  if (entries.length !== (next.userModelEntries ?? []).length) {
    next.userModelEntries = entries.length > 0 ? entries : undefined;
  }

  if (
    next.useCustomModel &&
    isSmokePoisonedCustomModel(next.customModelId, next.userModelEntries?.[0]?.label)
  ) {
    next.useCustomModel = undefined;
    next.customModelId = undefined;
    changed = true;
  }

  if (next.mode === "fixed" && next.fixedPresetId?.trim()) {
    if (next.useCustomModel || next.customModelId) {
      next.useCustomModel = undefined;
      next.customModelId = undefined;
      changed = true;
    }
  }

  if (next.mode === "fixed" && !next.fixedPresetId?.trim()) {
    const hasValidCustom =
      next.useCustomModel &&
      next.customModelId?.trim() &&
      !isSmokePoisonedCustomModel(next.customModelId);
    const hasValidEntries = (next.userModelEntries ?? []).length > 0;
    if (!hasValidCustom && !hasValidEntries) {
      next.mode = "auto";
      next.useCustomModel = undefined;
      next.customModelId = undefined;
      next.userModelEntries = undefined;
      changed = true;
    }
  }

  const normalized = normalizeAgentPreferences(next);
  return { prefs: normalized, changed };
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
    webSearchProvider:
      typeof raw.webSearchProvider === "string" ? raw.webSearchProvider : undefined,
    webScrapeProvider:
      typeof raw.webScrapeProvider === "string" ? raw.webScrapeProvider : undefined,
    browserRuntimeProvider:
      typeof raw.browserRuntimeProvider === "string" ? raw.browserRuntimeProvider : undefined,
    customModelId: raw.customModelId,
    useCustomModel: raw.useCustomModel,
    fixedPresetId: raw.fixedPresetId ? normalizePresetId(raw.fixedPresetId) : undefined,
    robinPoolModelId: raw.robinPoolModelId ? normalizePresetId(raw.robinPoolModelId) : undefined,
    hiddenPresetIds: Array.isArray(raw.hiddenPresetIds)
      ? raw.hiddenPresetIds.filter((x): x is string => typeof x === "string")
      : undefined,
    autoAllowedPresetIds: Array.isArray(raw.autoAllowedPresetIds)
      ? raw.autoAllowedPresetIds
          .filter((x): x is string => typeof x === "string")
          .map(normalizePresetId)
      : undefined,
    userModelEntries: normalizeUserModelEntries(raw),
    webSearchFallback:
      typeof raw.webSearchFallback === "string" ? raw.webSearchFallback : undefined,
    webScrapeFallback:
      typeof raw.webScrapeFallback === "string" ? raw.webScrapeFallback : undefined,
    browserFallback: typeof raw.browserFallback === "string" ? raw.browserFallback : undefined,
    contextWindow: normalizeContextWindowPrefs(raw.contextWindow),
    operation: normalizeOperationPrefs(raw.operation),
  };
}

function normalizeOperationPrefs(raw: unknown): OperationPrefs | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === "hotl" ? "hotl" : o.mode === "cooperative" ? "cooperative" : undefined;
  const hotlWallHours =
    o.hotlWallHours === 24 || o.hotlWallHours === 48 || o.hotlWallHours === 72
      ? o.hotlWallHours
      : undefined;
  if (!mode && !hotlWallHours) return undefined;
  if (mode === "hotl" || hotlWallHours) {
    return { mode: "hotl", hotlWallHours: hotlWallHours ?? 24 };
  }
  return { mode: "cooperative" };
}

function normalizeContextWindowPrefs(raw: unknown): ContextWindowPrefs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === "auto" ? "auto" : o.mode === "manual" ? "manual" : undefined;
  const windowTokens =
    typeof o.windowTokens === "number" && o.windowTokens > 0
      ? Math.floor(o.windowTokens)
      : undefined;
  if (!mode && !windowTokens) return undefined;
  return {
    mode: mode ?? "manual",
    windowTokens: windowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS,
  };
}

/** Carrega do banco e atualiza cache em memória. Fail-closed: {} se vazio. */
export async function loadAgentPreferencesFromDb(): Promise<AgentPreferences> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const { prefs: sanitized, changed } = sanitizeSmokePoisonedPreferences(parsed);
  if (changed) {
    const { error: writeError } = await supabase
      .from("profiles")
      .update({ agent_preferences: sanitized as unknown as Record<string, unknown> } as never)
      .eq("id", user.id);
    if (writeError) {
      console.warn("[agent-preferences] falha ao sanitizar prefs E2E:", writeError.message);
    }
  }
  setAgentPreferencesCache(sanitized);
  return sanitized;
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
