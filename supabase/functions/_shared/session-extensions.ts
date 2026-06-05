/** Skills/MCP do painel FORGE — conteúdo real + tools executáveis no agent-run. */

import { loadForgeSkillsForSession, type LoadedForgeSkill } from "./forge-skill-loader.ts";

export type ForgeMcpDef = {
  id: string;
  name: string;
  description: string;
  /** Tools registradas no agent-run quando este MCP está ativo */
  toolNames: string[];
  setupHint: string;
};

export const FORGE_MCP_BY_ID: Record<string, ForgeMcpDef> = {
  context7: {
    id: "context7",
    name: "Context7",
    description: "Documentação atualizada de bibliotecas (API Context7).",
    toolNames: ["context7_search_library", "context7_get_context"],
    setupHint: "Opcional: CONTEXT7_API_KEY em secrets do projeto para limites maiores.",
  },
  github: {
    id: "github",
    name: "GitHub",
    description: "Repositórios, issues e PRs com token do Conector GitHub.",
    toolNames: ["github_list_repos", "github_get_file"],
    setupHint: "Conecte GitHub em Conectores (token ghp_...).",
  },
  supabase: {
    id: "supabase",
    name: "Supabase",
    description: "Schema e SQL read-only do projeto FORGE.",
    toolNames: ["supabase_list_tables", "supabase_describe_table", "supabase_sql_readonly"],
    setupHint: "Usa o banco do projeto FORGE (service role, só SELECT).",
  },
  vercel: {
    id: "vercel",
    name: "Vercel",
    description: "Projetos e deployments na sua conta Vercel.",
    toolNames: ["vercel_list_projects", "vercel_list_deployments"],
    setupHint: "Conecte Vercel em Conectores.",
  },
  playwright: {
    id: "playwright",
    name: "Playwright",
    description: "Validação visual via preview E2B (sem MCP stdio externo).",
    toolNames: [],
    setupHint: "Use preview ao vivo + peça ao agente para validar rotas no sandbox.",
  },
  filesystem: {
    id: "filesystem",
    name: "Filesystem",
    description: "Arquivos do projeto via tools fs_* do agente.",
    toolNames: ["fs_read", "fs_write", "fs_edit", "fs_list", "fs_glob", "fs_delete", "fs_move"],
    setupHint: "Já disponível: fs_read, fs_write, fs_edit, fs_list, etc.",
  },
};

export function normalizeIdList(raw: unknown, max = 40): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export type SessionExtensionsResult = {
  addon: string;
  skillNames: string[];
  mcpNames: string[];
  skills: LoadedForgeSkill[];
  mcpToolNames: string[];
};

export async function buildSessionExtensionsPrompt(
  enabledSkillIds: string[],
  enabledMcpIds: string[],
): Promise<SessionExtensionsResult> {
  const skillNames: string[] = [];
  const mcpNames: string[] = [];
  const mcpToolNames: string[] = [];
  const blocks: string[] = [];

  const skills = await loadForgeSkillsForSession(enabledSkillIds);
  if (skills.length > 0) {
    const skillBlocks = skills.map((s) => {
      skillNames.push(s.name);
      const tag = s.bundled ? "SKILL.md completo" : "resumo";
      return `### Skill: ${s.name} (${s.id}) · ${tag}\n\n${s.body}`;
    });
    blocks.push(
      `## Skills ativas (painel FORGE)\n` +
        `Siga estas instruções nesta sessão. Conteúdo carregado do bundle oficial (${skills.length} skill(s)):\n\n` +
        skillBlocks.join("\n\n---\n\n"),
    );
  }

  const mcpLines: string[] = [];
  for (const id of enabledMcpIds) {
    const m = FORGE_MCP_BY_ID[id];
    if (!m) continue;
    mcpNames.push(m.name);
    for (const t of m.toolNames) {
      if (!mcpToolNames.includes(t)) mcpToolNames.push(t);
    }
    const toolsNote = m.toolNames.length
      ? `Tools: ${m.toolNames.join(", ")}.`
      : "Sem tools extras — siga o setupHint.";
    mcpLines.push(`- **${m.name}**: ${m.description} ${toolsNote} ${m.setupHint}`);
  }
  if (mcpLines.length > 0) {
    blocks.push(
      `## MCPs ativos (painel FORGE)\n` +
        `Use as tools listadas quando precisar de dados externos. Nunca invente saída de tool.\n\n` +
        mcpLines.join("\n"),
    );
  }

  return {
    addon: blocks.join("\n\n"),
    skillNames,
    mcpNames,
    skills,
    mcpToolNames,
  };
}