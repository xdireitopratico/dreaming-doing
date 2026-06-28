import type { AgentPreferences } from "@/lib/agent-preferences";

/** Setup obrigatório — modo explícito no DB (auto / fixed / robin), sem fallback. */
export function isAgentPreferencesConfigured(prefs: AgentPreferences): boolean {
  if (prefs.mode === "auto") return (prefs.autoAllowedPresetIds?.length ?? 0) > 0;
  if (prefs.mode === "fixed") {
    if (prefs.fixedPresetId?.trim()) return true;
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

  if (prefs.mode === "auto" && (prefs.autoAllowedPresetIds?.length ?? 0) === 0) {
    return "Setup: selecione de 1 a 5 modelos para o Auto em Api & Models (/api-models) e salve.";
  }

  if (
    prefs.mode === "fixed" &&
    !prefs.fixedPresetId?.trim() &&
    !(prefs.useCustomModel && prefs.customModelId?.trim())
  ) {
    return "Setup: selecione um modelo fixo em Api & Models (/api-models) e salve.";
  }
  if (prefs.mode === "robin" && (!prefs.robinPoolModelId?.trim() || !prefs.poolProvider)) {
    return "Setup: em Api & Models escolha ROBIN + provedor do pool + modelo e salve.";
  }
  return "Setup obrigatório: configure modelo em /api-models e chaves em Providers & Keys.";
}
