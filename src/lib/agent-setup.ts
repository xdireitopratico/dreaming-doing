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
  if (prefs.mode === "fixed") return !!prefs.fixedPresetId?.trim();
  if (prefs.mode === "robin") {
    return !!prefs.robinPoolModelId?.trim() && !!prefs.poolProvider;
  }
  return false;
}

export function getAgentSetupBlockMessage(prefs: AgentPreferences): string {
  if (!hasStoredAgentPreferences()) {
    return "Setup obrigatório: abra API, escolha modo (Fixo ou ROBIN), modelo e salve.";
  }

  if (prefs.mode === "fixed" && !prefs.fixedPresetId?.trim()) {
    return "Setup: selecione um modelo fixo em API.";
  }
  if (prefs.mode === "robin" && (!prefs.robinPoolModelId?.trim() || !prefs.poolProvider)) {
    return "Setup: selecione provedor e modelo do pool ROBIN em API.";
  }
  return "Setup obrigatório: configure modelo e chaves em API.";
}