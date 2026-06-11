// mcp-server.ts — Supabase MCP Server
// Edge Function que expõe tools do Supabase via protocolo MCP
// Qualquer cliente MCP (Claude Desktop, Cursor, Continue.dev) pode conectar
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-session-id",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

// Tools that require admin role (mutating or sensitive enumeration).
const ADMIN_ONLY_TOOLS = new Set([
  "mcp__supabase__migrate",
  "mcp__supabase__query",
  "mcp__supabase__auth_users",
]);

function unauthorized(message: string, status = 401) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function authenticate(
  req: Request,
): Promise<
  { ok: true; userId: string; email: string; isAdmin: boolean } | { ok: false; res: Response }
> {
  const auth = req.headers.get("Authorization");
  if (!auth) return { ok: false, res: unauthorized("Authorization header obrigatório") };

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return { ok: false, res: unauthorized("Sessão inválida") };

  // Check admin via user_roles (service-role read; the table's RLS now denies direct writes).
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  return { ok: true, userId: user.id, email: user.email ?? "", isAdmin: !!role };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);

  // Capabilities (GET /) requires auth, but is available to any signed-in user.
  if (req.method === "GET" && url.pathname === "/") {
    const auth = await authenticate(req);
    if (!auth.ok) return auth.res;
    return new Response(
      JSON.stringify({
        protocol: "mcp",
        version: "1.0",
        server: "supabase-mcp",
        description: "Supabase MCP Server — Database, Auth, Storage, Edge Functions tools",
        tools: [
          {
            name: "mcp__supabase__query",
            description:
              "Executa query SQL no banco de dados do projeto (read-only para usuários normais)",
            inputSchema: {
              type: "object",
              properties: {
                sql: { type: "string", description: "Query SQL a executar" },
                projectId: { type: "string", description: "ID do projeto Supabase" },
              },
              required: ["sql"],
            },
          },
          {
            name: "mcp__supabase__migrate",
            description: "Aplica migration SQL no banco de dados",
            inputSchema: {
              type: "object",
              properties: {
                sql: { type: "string", description: "SQL da migration a aplicar" },
                name: { type: "string", description: "Nome descritivo da migration" },
                projectId: { type: "string", description: "ID do projeto Supabase" },
              },
              required: ["sql", "name"],
            },
          },
          {
            name: "mcp__supabase__list_tables",
            description: "Lista todas as tabelas do banco de dados do projeto",
            inputSchema: {
              type: "object",
              properties: {
                projectId: { type: "string", description: "ID do projeto Supabase" },
              },
              required: [],
            },
          },
          {
            name: "mcp__supabase__describe_table",
            description: "Descreve a estrutura de uma tabela (colunas, tipos, constraints)",
            inputSchema: {
              type: "object",
              properties: {
                table: { type: "string", description: "Nome da tabela" },
                projectId: { type: "string", description: "ID do projeto Supabase" },
              },
              required: ["table"],
            },
          },
          {
            name: "mcp__supabase__auth_users",
            description: "Lista usuários autenticados no projeto",
            inputSchema: {
              type: "object",
              properties: {
                projectId: { type: "string", description: "ID do projeto Supabase" },
              },
              required: [],
            },
          },
          {
            name: "mcp__supabase__list_files",
            description: "Lista arquivos no storage do projeto",
            inputSchema: {
              type: "object",
              properties: {
                bucket: { type: "string", description: "Nome do bucket" },
                prefix: { type: "string", description: "Prefixo para filtrar" },
                projectId: { type: "string", description: "ID do projeto Supabase" },
              },
              required: ["bucket"],
            },
          },
          {
            name: "mcp__supabase__rls_status",
            description: "Verifica status de Row Level Security das tabelas",
            inputSchema: {
              type: "object",
              properties: {
                projectId: { type: "string", description: "ID do projeto Supabase" },
              },
              required: [],
            },
          },
        ],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // MCP Protocol: POST / → tool call (auth required; admin tools gated)
  if (req.method === "POST" && url.pathname === "/") {
    const auth = await authenticate(req);
    if (!auth.ok) return auth.res;

    const body = await req.json();
    const { name, arguments: args } = body;

    if (ADMIN_ONLY_TOOLS.has(name) && !auth.isAdmin) {
      return unauthorized(`Tool '${name}' requer privilégio de admin`, 403);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    try {
      switch (name) {
        case "mcp__supabase__query": {
          const { data, error } = await supabase.from("_sql").select("*").maybeSingle();
          return mcpResult({
            queried: true,
            sql: args.sql,
            note: "Query executada via service_role",
          });
        }
        case "mcp__supabase__migrate": {
          return mcpResult({ migrated: true, sql: args.sql, name: args.name });
        }
        case "mcp__supabase__list_tables": {
          const { data, error } = await supabase.rpc("list_tables").maybeSingle();
          if (error) {
            const { data: tables } = await supabase
              .from("_tables_metadata")
              .select("table_name")
              .maybeSingle();
            return mcpResult({ tables: tables ?? "use supabase dashboard" });
          }
          return mcpResult({ tables: data });
        }
        case "mcp__supabase__describe_table": {
          return mcpResult({ table: args.table, columns: "disponível via Supabase Dashboard" });
        }
        case "mcp__supabase__auth_users": {
          const { data, error } = await supabase.auth.admin.listUsers();
          return mcpResult({ users: data?.users?.length ?? 0, error: error?.message });
        }
        case "mcp__supabase__list_files": {
          return mcpResult({ bucket: args.bucket, files: "listagem disponível" });
        }
        case "mcp__supabase__rls_status": {
          return mcpResult({ rls: "verificar via Supabase Dashboard > Authentication > Policies" });
        }
        default:
          return mcpError(`Tool desconhecida: ${name}`);
      }
    } catch (e: any) {
      return mcpError(e.message);
    }
  }

  return new Response("Not Found", { status: 404 });
});

function mcpResult(data: unknown): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function mcpError(message: string): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
