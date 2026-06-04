import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED = new Set(["github", "vercel", "cloudflare", "anthropic", "openai"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Sessão inválida" }, 401);

    const body = await req.json();
    const kind = body?.kind as string;
    if (!kind || !ALLOWED.has(kind)) return json({ error: "Connector inválido" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    if (body?.disconnect === true) {
      await admin.from("connectors").delete().eq("owner_id", user.id).eq("kind", kind);
      if (kind === "github") {
        await admin.from("profiles").update({ github_username: null }).eq("id", user.id);
      }
      return json({ ok: true, connected: false });
    }

    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const meta =
      typeof body?.meta === "object" && body.meta !== null ? body.meta : {};

    if (!token && kind === "vercel") {
      return json({ error: "Token Vercel obrigatório" }, 400);
    }

    const row: Record<string, unknown> = {
      owner_id: user.id,
      kind,
      meta: { ...meta, connectedAt: new Date().toISOString(), label: meta.label ?? kind },
      updated_at: new Date().toISOString(),
    };
    if (token) row.token_encrypted = token;

    const { error } = await admin.from("connectors").upsert(row, {
      onConflict: "owner_id,kind",
    });
    if (error) return json({ error: error.message }, 500);

    if (kind === "github" && typeof meta.githubUsername === "string") {
      await admin
        .from("profiles")
        .update({ github_username: meta.githubUsername })
        .eq("id", user.id);
    }

    return json({ ok: true, connected: true });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});