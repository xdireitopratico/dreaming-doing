/**
 * SSOT: profiles.agent_preferences — sem localStorage, sem inferir modo por chaves.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { AgentPreferencesPayload } from "./connector-keys.ts";
import { normalizePresetId } from "../_shared/preset-contract.ts";

type UserModelEntry = { slug: string; env: string; label?: string };

function normalizeUserModelEntries(raw: Record<string, unknown>): UserModelEntry[] | undefined {
  const fromField = Array.isArray(raw.userModelEntries)
    ? raw.userModelEntries
        .filter(
          (e): e is UserModelEntry =>
            !!e &&
            typeof e === "object" &&
            typeof (e as UserModelEntry).slug === "string" &&
            typeof (e as UserModelEntry).env === "string",
        )
        .map((e) => ({
          slug: e.slug.trim(),
          env: e.env,
          label: typeof e.label === "string" ? e.label.trim() : undefined,
        }))
    : [];
  return fromField.length > 0 ? fromField : undefined;
}

export function normalizeAgentPreferences(
  raw: unknown,
): AgentPreferencesPayload | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const modeRaw = r.mode === "rob" ? "robin" : r.mode;
  const mode: AgentPreferencesPayload["mode"] =
    modeRaw === "robin" || modeRaw === "fixed" || modeRaw === "auto"
      ? modeRaw
      : undefined;
  const normalized = {
    mode,
    poolProvider: typeof r.poolProvider === "string" ? r.poolProvider : undefined,
    fixedPresetId: typeof r.fixedPresetId === "string"
      ? normalizePresetId(r.fixedPresetId)
      : undefined,
    robinPoolModelId: typeof r.robinPoolModelId === "string"
      ? normalizePresetId(r.robinPoolModelId)
      : undefined,
    customModelId: typeof r.customModelId === "string" ? r.customModelId : undefined,
    useCustomModel: r.useCustomModel === true,
    parserProvider: typeof r.parserProvider === "string" ? r.parserProvider : undefined,
    webSearchProvider: typeof r.webSearchProvider === "string" ? r.webSearchProvider : undefined,
    webScrapeProvider: typeof r.webScrapeProvider === "string" ? r.webScrapeProvider : undefined,
    browserRuntimeProvider:
      typeof r.browserRuntimeProvider === "string" ? r.browserRuntimeProvider : undefined,
    autoAllowedPresetIds: Array.isArray(r.autoAllowedPresetIds)
      ? r.autoAllowedPresetIds
          .filter((x): x is string => typeof x === "string")
          .map(normalizePresetId)
      : undefined,
    userModelEntries: normalizeUserModelEntries(r),
    webSearchFallback: typeof r.webSearchFallback === "string" ? r.webSearchFallback : undefined,
    webScrapeFallback: typeof r.webScrapeFallback === "string" ? r.webScrapeFallback : undefined,
    browserFallback: typeof r.browserFallback === "string" ? r.browserFallback : undefined,
  };

  return Object.values(normalized).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined;
  })
    ? normalized
    : undefined;
}

/** Carrega preferências do perfil. Fail-closed: undefined se vazio. */
export async function loadAgentPreferencesFromDb(
  supabase: SupabaseClient,
  userId: string,
): Promise<AgentPreferencesPayload | undefined> {
  const { data, error } = await supabase
    .from("profiles")
    .select("agent_preferences")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar agent_preferences: ${error.message}`);
  }

  const raw = (data as { agent_preferences?: unknown } | null)?.agent_preferences;
  const parsed = normalizeAgentPreferences(raw);
  if (!parsed) return undefined;
  const { prefs, changed } = sanitizeSmokePoisonedPreferences(parsed);
  if (changed) {
    const { error: writeError } = await supabase
      .from("profiles")
      .update({ agent_preferences: prefs })
      .eq("id", userId);
    if (writeError) {
      console.warn("[agent-preferences-db] falha ao sanitizar prefs E2E:", writeError.message);
    }
  }
  return prefs;
}

const SMOKE_POISONED_MODEL_SLUGS = new Set([
  "cohere/north-mini-code:free",
  "nex-agi/nex-n2-pro:free",
]);

function isSmokePoisonedUserModelEntry(entry: UserModelEntry): boolean {
  if (entry.label && /\be2e\b/i.test(entry.label)) return true;
  if (SMOKE_POISONED_MODEL_SLUGS.has(entry.slug.trim())) {
    return /\be2e\b/i.test(entry.label ?? "") || entry.label === "E2E OpenRouter free";
  }
  return false;
}

function isSmokePoisonedCustomModel(slug?: string): boolean {
  const s = slug?.trim();
  if (!s) return false;
  return SMOKE_POISONED_MODEL_SLUGS.has(s);
}

function sanitizeSmokePoisonedPreferences(prefs: AgentPreferencesPayload): {
  prefs: AgentPreferencesPayload;
  changed: boolean;
} {
  const next = { ...prefs };
  let changed = false;

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

  if (next.useCustomModel && isSmokePoisonedCustomModel(next.customModelId)) {
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

  return { prefs: next, changed };
}
