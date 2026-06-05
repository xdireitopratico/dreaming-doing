import { supabase } from "@/integrations/supabase/client";
import { parseIntegrationPrefs, type IntegrationPrefs } from "@/lib/connectors/integration-prefs";

const SKILL_KEY = "forge:enabled-skill-ids";
const MCP_KEY = "forge:enabled-mcp-ids";

type AgentExtensionsSlice = {
  skillIds?: string[];
  mcpIds?: string[];
};

function readSlice(prefs: IntegrationPrefs & AgentExtensionsSlice): {
  skillIds: string[];
  mcpIds: string[];
} {
  const ext = prefs as IntegrationPrefs & AgentExtensionsSlice;
  return {
    skillIds: Array.isArray(ext.skillIds) ? ext.skillIds.filter((x) => typeof x === "string") : [],
    mcpIds: Array.isArray(ext.mcpIds) ? ext.mcpIds.filter((x) => typeof x === "string") : [],
  };
}

export function loadEnabledSkillIdsLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SKILL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function loadEnabledMcpIdsLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MCP_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveLocalSkills(ids: string[]) {
  localStorage.setItem(SKILL_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event("forge:skills-updated"));
}

function saveLocalMcps(ids: string[]) {
  localStorage.setItem(MCP_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event("forge:mcp-updated"));
}

/** Mescla skill/mcp IDs no integration_prefs do perfil (sync entre dispositivos). */
export async function persistAgentExtensions(
  userId: string,
  skillIds: string[],
  mcpIds: string[],
  currentPrefs: unknown,
): Promise<void> {
  const base = parseIntegrationPrefs(currentPrefs) as IntegrationPrefs & AgentExtensionsSlice;
  const next = { ...base, skillIds, mcpIds };
  const { error } = await supabase
    .from("profiles")
    .update({ integration_prefs: next, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

export function mergeExtensionsFromProfile(rawPrefs: unknown): {
  skillIds: string[];
  mcpIds: string[];
} {
  const fromProfile = readSlice(parseIntegrationPrefs(rawPrefs) as IntegrationPrefs & AgentExtensionsSlice);
  const localSkills = loadEnabledSkillIdsLocal();
  const localMcps = loadEnabledMcpIdsLocal();
  const skillIds = fromProfile.skillIds.length ? fromProfile.skillIds : localSkills;
  const mcpIds = fromProfile.mcpIds.length ? fromProfile.mcpIds : localMcps;
  if (typeof window !== "undefined") {
    if (fromProfile.skillIds.length) saveLocalSkills(skillIds);
    if (fromProfile.mcpIds.length) saveLocalMcps(mcpIds);
  }
  return { skillIds, mcpIds };
}

export async function toggleSkillIdPersisted(
  userId: string,
  id: string,
  currentPrefs: unknown,
): Promise<string[]> {
  const { skillIds, mcpIds } = mergeExtensionsFromProfile(currentPrefs);
  const next = skillIds.includes(id) ? skillIds.filter((x) => x !== id) : [...skillIds, id];
  saveLocalSkills(next);
  await persistAgentExtensions(userId, next, mcpIds, currentPrefs);
  return next;
}

export async function toggleMcpIdPersisted(
  userId: string,
  id: string,
  currentPrefs: unknown,
): Promise<string[]> {
  const { skillIds, mcpIds } = mergeExtensionsFromProfile(currentPrefs);
  const next = mcpIds.includes(id) ? mcpIds.filter((x) => x !== id) : [...mcpIds, id];
  saveLocalMcps(next);
  await persistAgentExtensions(userId, skillIds, next, currentPrefs);
  return next;
}