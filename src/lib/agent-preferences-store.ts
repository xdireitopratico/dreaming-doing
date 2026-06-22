/**
 * Cache em memória — populado só via loadAgentPreferencesFromDb (SSOT: Postgres).
 */
import type { AgentPreferences } from "@/lib/agent-preferences";

let cache: AgentPreferences | null = null;
let hydrated = false;

export function getAgentPreferencesCache(): AgentPreferences {
  return cache ?? {};
}

export function setAgentPreferencesCache(prefs: AgentPreferences): void {
  cache = prefs;
  hydrated = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("forge:prefs-updated"));
  }
}

export function clearAgentPreferencesCache(): void {
  cache = null;
  hydrated = false;
}

export function isAgentPreferencesHydrated(): boolean {
  return hydrated;
}