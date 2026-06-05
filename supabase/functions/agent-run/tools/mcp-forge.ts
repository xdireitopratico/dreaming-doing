// mcp-forge.ts — Tools MCP executáveis quando o usuário ativa MCPs no painel
import type { ToolRegistry } from "../registry.ts";
import { FORGE_MCP_BY_ID } from "../../_shared/session-extensions.ts";

export type McpForgeContext = {
  supabase: any;
  projectId: string;
  userId: string;
  enabledMcpIds: string[];
  deployKeys: Record<string, string>;
  context7ApiKey?: string;
};

function enabledSet(ids: string[]): Set<string> {
  return new Set(ids);
}

function isSelectOnly(sql: string): boolean {
  const s = sql.trim().toLowerCase();
  if (!s.startsWith("select")) return false;
  return !/\b(insert|update|delete|drop|alter|truncate|grant|revoke|create)\b/i.test(s);
}

export function registerMcpForgeTools(reg: ToolRegistry, ctx: McpForgeContext): void {
  const on = enabledSet(ctx.enabledMcpIds);

  if (on.has("supabase")) {
    reg.register(
      {
        name: "supabase_list_tables",
        description: "Lista tabelas public do banco FORGE (schema do projeto).",
        parameters: { type: "object", properties: {}, required: [] },
      },
      async () => {
        const { data, error } = await ctx.supabase.rpc("forge_list_public_tables");
        if (error) {
          return {
            toolCallId: "",
            ok: true,
            output: {
              tables: ["projects", "project_files", "conversations", "messages", "connectors", "profiles", "deployments"],
              note: error.message,
            },
          };
        }
        return { toolCallId: "", ok: true, output: { tables: data ?? [] } };
      },
    );

    reg.register(
      {
        name: "supabase_describe_table",
        description: "Colunas de uma tabela public (information_schema).",
        parameters: {
          type: "object",
          properties: { table: { type: "string" } },
          required: ["table"],
        },
      },
      async (args) => {
        const table = String(args.table ?? "").replace(/[^a-z0-9_]/gi, "");
        const { data, error } = await ctx.supabase.rpc("forge_describe_table", { p_table: table });
        if (error) return { toolCallId: "", ok: false, error: error.message, output: null };
        return { toolCallId: "", ok: true, output: data };
      },
    );

    reg.register(
      {
        name: "supabase_sql_readonly",
        description: "Executa SELECT read-only no banco FORGE. Proibido INSERT/UPDATE/DELETE.",
        parameters: {
          type: "object",
          properties: { sql: { type: "string" } },
          required: ["sql"],
        },
      },
      async (args) => {
        const sql = String(args.sql ?? "");
        if (!isSelectOnly(sql)) {
          return { toolCallId: "", ok: false, error: "Apenas SELECT é permitido", output: null };
        }
        const { data, error } = await ctx.supabase.rpc("forge_agent_sql_readonly", { p_sql: sql });
        if (error) return { toolCallId: "", ok: false, error: error.message, output: null };
        return { toolCallId: "", ok: true, output: data };
      },
    );
  }

  if (on.has("github")) {
    const token = ctx.deployKeys.GITHUB_TOKEN;
    reg.register(
      {
        name: "github_list_repos",
        description: "Lista repositórios GitHub do usuário (requer token em Conectores).",
        parameters: {
          type: "object",
          properties: { per_page: { type: "number" } },
          required: [],
        },
      },
      async (args) => {
        if (!token) {
          return { toolCallId: "", ok: false, error: "GitHub não conectado em Conectores", output: null };
        }
        const perPage = Math.min(Number(args.per_page) || 15, 30);
        const res = await fetch(`https://api.github.com/user/repos?per_page=${perPage}&sort=updated`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "FORGE-Agent",
          },
        });
        if (!res.ok) {
          return { toolCallId: "", ok: false, error: `GitHub ${res.status}`, output: null };
        }
        const repos = await res.json() as { full_name: string; private: boolean; html_url: string }[];
        return {
          toolCallId: "",
          ok: true,
          output: repos.map((r) => ({ full_name: r.full_name, private: r.private, url: r.html_url })),
        };
      },
    );

    reg.register(
      {
        name: "github_get_file",
        description: "Lê um arquivo de um repositório GitHub (conteúdo base64 decodificado).",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string" },
            repo: { type: "string" },
            path: { type: "string" },
            ref: { type: "string" },
          },
          required: ["owner", "repo", "path"],
        },
      },
      async (args) => {
        if (!token) {
          return { toolCallId: "", ok: false, error: "GitHub não conectado", output: null };
        }
        const owner = String(args.owner);
        const repo = String(args.repo);
        const path = String(args.path).replace(/^\//, "");
        const ref = args.ref ? `?ref=${encodeURIComponent(String(args.ref))}` : "";
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${path}${ref}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "FORGE-Agent",
            },
          },
        );
        if (!res.ok) {
          return { toolCallId: "", ok: false, error: `GitHub ${res.status}`, output: null };
        }
        const file = await res.json() as { content?: string; encoding?: string; size?: number };
        if (file.encoding === "base64" && file.content) {
          const text = atob(file.content.replace(/\n/g, ""));
          return { toolCallId: "", ok: true, output: { path, size: file.size, content: text.slice(0, 80_000) } };
        }
        return { toolCallId: "", ok: true, output: file };
      },
    );
  }

  if (on.has("vercel")) {
    const token = ctx.deployKeys.VERCEL_TOKEN;
    reg.register(
      {
        name: "vercel_list_projects",
        description: "Lista projetos Vercel da conta conectada.",
        parameters: { type: "object", properties: {}, required: [] },
      },
      async () => {
        if (!token) {
          return { toolCallId: "", ok: false, error: "Vercel não conectado em Conectores", output: null };
        }
        const res = await fetch("https://api.vercel.com/v9/projects?limit=20", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return { toolCallId: "", ok: false, error: `Vercel ${res.status}`, output: null };
        const body = await res.json() as { projects?: { name: string; id: string }[] };
        return { toolCallId: "", ok: true, output: body.projects ?? [] };
      },
    );

    reg.register(
      {
        name: "vercel_list_deployments",
        description: "Lista deployments recentes de um projeto Vercel.",
        parameters: {
          type: "object",
          properties: { projectId: { type: "string" }, limit: { type: "number" } },
          required: ["projectId"],
        },
      },
      async (args) => {
        if (!token) {
          return { toolCallId: "", ok: false, error: "Vercel não conectado", output: null };
        }
        const projectId = String(args.projectId);
        const limit = Math.min(Number(args.limit) || 10, 20);
        const res = await fetch(
          `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=${limit}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return { toolCallId: "", ok: false, error: `Vercel ${res.status}`, output: null };
        const body = await res.json() as { deployments?: unknown[] };
        return { toolCallId: "", ok: true, output: body.deployments ?? [] };
      },
    );
  }

  if (on.has("context7")) {
    const key = ctx.context7ApiKey?.trim() || Deno.env.get("CONTEXT7_API_KEY")?.trim() || "";
    const headers: Record<string, string> = { Accept: "application/json" };
    if (key) headers.Authorization = `Bearer ${key}`;

    reg.register(
      {
        name: "context7_search_library",
        description: "Busca library ID Context7 para documentação atual (ex: Next.js, Supabase).",
        parameters: {
          type: "object",
          properties: {
            libraryName: { type: "string" },
            query: { type: "string" },
          },
          required: ["libraryName", "query"],
        },
      },
      async (args) => {
        const libraryName = String(args.libraryName ?? "");
        const query = String(args.query ?? "");
        const url = new URL("https://context7.com/api/v2/libs/search");
        url.searchParams.set("libraryName", libraryName);
        url.searchParams.set("query", query);
        const res = await fetch(url, { headers });
        if (!res.ok) {
          const err = await res.text();
          return { toolCallId: "", ok: false, error: `Context7 ${res.status}: ${err.slice(0, 200)}`, output: null };
        }
        const data = await res.json();
        return { toolCallId: "", ok: true, output: data };
      },
    );

    reg.register(
      {
        name: "context7_get_context",
        description: "Obtém snippets de documentação Context7 para uma library ID e pergunta.",
        parameters: {
          type: "object",
          properties: {
            libraryId: { type: "string" },
            query: { type: "string" },
          },
          required: ["libraryId", "query"],
        },
      },
      async (args) => {
        const libraryId = String(args.libraryId ?? "");
        const query = String(args.query ?? "");
        const url = new URL("https://context7.com/api/v2/context");
        url.searchParams.set("libraryId", libraryId);
        url.searchParams.set("query", query);
        url.searchParams.set("type", "json");
        const res = await fetch(url, { headers });
        if (!res.ok) {
          const err = await res.text();
          return { toolCallId: "", ok: false, error: `Context7 ${res.status}: ${err.slice(0, 200)}`, output: null };
        }
        const data = await res.json();
        return { toolCallId: "", ok: true, output: data };
      },
    );
  }

  // filesystem / playwright: sem tools extras — instruções no prompt via FORGE_MCP_BY_ID
  void FORGE_MCP_BY_ID;
}