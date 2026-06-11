import { loadEnabledMcpIdsLocal, loadEnabledSkillIdsLocal } from "@/lib/agent-extensions-prefs";

/** Payload enviado ao agent-run com skills/MCP ativados no painel (localStorage + perfil). */
export function loadAgentSessionExtensions(): {
  enabledSkillIds: string[];
  enabledMcpIds: string[];
} {
  return {
    enabledSkillIds: loadEnabledSkillIdsLocal(),
    enabledMcpIds: loadEnabledMcpIdsLocal(),
  };
}
