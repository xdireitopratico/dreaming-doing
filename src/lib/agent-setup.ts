import type { AgentPreferences } from "@/lib/agent-preferences";

/** Setup obrigatório — modo explícito no DB (auto / fixed / robin), sem fallback. */
export function isAgentPreferencesConfigured(prefs: AgentPreferences): boolean {
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
  if (!prefs.mode) {
    return "Setup obrigatório: abra Api & Models (/api-models), escolha Auto, Fixo ou ROBIN e salve.";
  }

  if (
    prefs.mode === "fixed" &&
    !prefs.fixedPresetId?.trim() &&
    !(prefs.useCustomModel && prefs.customModelId?.trim()) &&
    (prefs.userModelEntries?.length ?? 0) === 0
  ) {
    return "Setup: selecione um modelo fixo em Api & Models (/api-models) e salve.";
  }
  if (prefs.mode === "robin" && (!prefs.robinPoolModelId?.trim() || !prefs.poolProvider)) {
    return "Setup: em Api & Models escolha ROBIN + provedor do pool + modelo e salve.";
  }
  return "Setup obrigatório: configure modelo em /api-models e chaves em Providers & Keys.";
}