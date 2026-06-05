export type McpCatalogEntry = {
  id: string;
  name: string;
  description: string;
  transport: "stdio" | "sse" | "http";
  docsUrl?: string;
  envKeys?: string[];
};

/** MCPs sugeridos — configuração salva no perfil (enabled_mcp_ids). */
export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: "context7",
    name: "Context7",
    description: "Documentação atualizada de bibliotecas no contexto do agente.",
    transport: "sse",
    docsUrl: "https://github.com/upstash/context7",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Issues, PRs e repositórios via MCP oficial.",
    transport: "stdio",
    envKeys: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Schema, SQL e migrações do seu projeto.",
    transport: "stdio",
    envKeys: ["SUPABASE_ACCESS_TOKEN"],
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Deploys, logs e projetos Vercel.",
    transport: "http",
    docsUrl: "https://vercel.com/docs/mcp",
  },
  {
    id: "playwright",
    name: "Playwright",
    description: "Navegação e testes E2E no browser.",
    transport: "stdio",
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Leitura/escrita de arquivos locais (sandbox).",
    transport: "stdio",
  },
];

const STORAGE_KEY = "forge:enabled-mcp-ids";

export function loadEnabledMcpIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveEnabledMcpIds(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event("forge:mcp-updated"));
}

export function toggleMcpId(id: string): string[] {
  const cur = loadEnabledMcpIds();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  saveEnabledMcpIds(next);
  return next;
}