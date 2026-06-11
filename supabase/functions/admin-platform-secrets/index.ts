import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertForgeAdmin, isForgeAdminEmail } from "../_shared/forge-admin.ts";
import { buildSecretHint } from "../_shared/platform-secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED_NAMES = new Set([
  "XAI_API_KEY",
  "GROQ_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "NVIDIA_API_KEY",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function ensureAdminRole(admin: ReturnType<typeof createClient>, userId: string) {
  await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
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

    if (!isForgeAdminEmail(user.email)) {
      return json({ error: "Acesso negado" }, 403);
    }

    assertForgeAdmin(user);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    await ensureAdminRole(admin, user.id);

    const body = await req.json();
    const action = body?.action as string;

    if (action === "status") {
      return json({ ok: true, isAdmin: true, email: user.email });
    }

    if (action === "list") {
      const { data: rows, error } = await admin
        .from("platform_secrets")
        .select("name, hint, updated_at")
        .order("name");
      if (error) return json({ error: error.message }, 500);

      const configured = new Set((rows ?? []).map((r) => r.name));
      const secrets = [...ALLOWED_NAMES].sort().map((name) => {
        const row = rows?.find((r) => r.name === name);
        return {
          name,
          configured: configured.has(name),
          hint: row?.hint ?? null,
          updatedAt: row?.updated_at ?? null,
          fromEdgeEnv: !!Deno.env.get(name),
        };
      });

      return json({ ok: true, secrets });
    }

    if (action === "upsert") {
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const value = typeof body?.value === "string" ? body.value.trim() : "";
      if (!ALLOWED_NAMES.has(name)) return json({ error: "Secret não permitida" }, 400);
      if (!value) return json({ error: "Valor obrigatório" }, 400);

      const { error } = await admin.from("platform_secrets").upsert({
        name,
        value_encrypted: value,
        hint: buildSecretHint(value),
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      });
      if (error) return json({ error: error.message }, 500);

      return json({
        ok: true,
        name,
        hint: buildSecretHint(value),
        configured: true,
      });
    }

    if (action === "delete") {
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      if (!ALLOWED_NAMES.has(name)) return json({ error: "Secret não permitida" }, 400);

      const { error } = await admin.from("platform_secrets").delete().eq("name", name);
      if (error) return json({ error: error.message }, 500);

      return json({ ok: true, name, configured: false });
    }

    return json({ error: "action inválida" }, 400);
  } catch (e) {
    const msg = (e as Error).message ?? "Erro interno";
    const status = msg.includes("Acesso negado") ? 403 : 500;
    return json({ error: msg }, status);
  }
});
