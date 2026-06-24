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
  const mode =
    modeRaw === "robin" || modeRaw === "fixed" || modeRaw === "auto"
      ? modeRaw
      : undefined;
  if (!mode) return undefined;

  return {
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
}

/** Carrega preferências do perfil. Fail-closed: undefined se vazio ou sem mode. */
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
  return normalizeAgentPreferences(raw);
}