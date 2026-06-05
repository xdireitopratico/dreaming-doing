export type McpCatalogEntry = {
  id: string;
  name: string;
  description: string;
  transport: "stdio" | "sse" | "http";
  docsUrl?: string;
  envKeys?: string[];
  /** Tools reais registradas no agent-run quando ativo */
  executable: boolean;
  toolCount: number;
};

/** MCPs sugeridos — configuração salva no perfil (enabled_mcp_ids). */
export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: "context7",
    name: "Context7",
    description: "Documentação atualizada via API Context7 (search + context).",
    transport: "http",
    docsUrl: "https://context7.com/docs/api-guide",
    executable: true,
    toolCount: 2,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Repos e arquivos com token em Conectores.",
    transport: "http",
    envKeys: ["GITHUB_TOKEN"],
    executable: true,
    toolCount: 2,
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Schema e SELECT read-only do banco FORGE.",
    transport: "http",
    executable: true,
    toolCount: 3,
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Projetos e deployments na sua conta.",
    transport: "http",
    docsUrl: "https://vercel.com/docs/rest-api",
    envKeys: ["VERCEL_TOKEN"],
    executable: true,
    toolCount: 2,
  },
  {
    id: "playwright",
    name: "Playwright",
    description: "Orientação E2E — use preview ao vivo do projeto.",
    transport: "stdio",
    executable: false,
    toolCount: 0,
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description: "fs_* do agente (leitura/escrita no projeto).",
    transport: "stdio",
    executable: true,
    toolCount: 7,
  },
];

import { loadEnabledMcpIdsLocal } from "@/lib/agent-extensions-prefs";

export function loadEnabledMcpIds(): string[] {
  return loadEnabledMcpIdsLocal();
}