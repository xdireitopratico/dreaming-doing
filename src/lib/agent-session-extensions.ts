import { loadEnabledMcpIds } from "@/lib/mcp-catalog";
import { loadEnabledSkillIds } from "@/lib/skills-catalog";

/** Payload enviado ao agent-run com skills/MCP ativados no painel. */
export function loadAgentSessionExtensions(): {
  enabledSkillIds: string[];
  enabledMcpIds: string[];
} {
  return {
    enabledSkillIds: loadEnabledSkillIds(),
    enabledMcpIds: loadEnabledMcpIds(),
  };
}