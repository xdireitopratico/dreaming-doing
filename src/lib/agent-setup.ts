import type { AgentPreferences } from "@/lib/agent-preferences";

const STORAGE_KEY = "forge:agent-preferences";

export function hasStoredAgentPreferences(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(STORAGE_KEY);
}

/** Setup obrigatório: sem defaults silenciosos — o usuário salva modo + modelo em /api. */
export function isAgentPreferencesConfigured(prefs: AgentPreferences): boolean {
  if (!hasStoredAgentPreferences()) return false;
  if (prefs.mode === "auto") return true;
  if (prefs.mode === "fixed") {
    if (prefs.fixedPresetId?.trim()) return true;
    if (prefs.useCustomModel && prefs.customModelId?.trim()) return true;
    if ((prefs.userModelEntries?.length ?? 0) > 0) return true;
    return false;
  }
  if (prefs.mode === "robin") {
    return !!prefs.robinPoolModelId?.trim() && !!prefs.poolProvider;
  }
  return false;
}

export function getAgentSetupBlockMessage(prefs: AgentPreferences): string {
  if (!hasStoredAgentPreferences()) {
    return "Setup obrigatório: abra Modelos (/models), escolha Fixo ou ROBIN, Nemotron 550B e salve.";
  }

  if (
    prefs.mode === "fixed" &&
    !prefs.fixedPresetId?.trim() &&
    !(prefs.useCustomModel && prefs.customModelId?.trim()) &&
    (prefs.userModelEntries?.length ?? 0) === 0
  ) {
    return "Setup: selecione um modelo fixo em Modelos (/models) e salve.";
  }
  if (prefs.mode === "robin" && (!prefs.robinPoolModelId?.trim() || !prefs.poolProvider)) {
    return "Setup: em Modelos (/models) escolha ROBIN + pool NVIDIA + Nemotron 550B e salve.";
  }
  return "Setup obrigatório: configure modelo em /models e chave NVIDIA + E2B em /api.";
}
