// e2b-health — diagnóstico BYOK: create + node/npm smoke + kill
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { FORGE_CORS_HEADERS, corsPreflightResponse } from "../_shared/cors.ts";
import { loadUserE2bApiKey, E2B_SETUP_USER_MESSAGE } from "../_shared/user-e2b.ts";
import { runE2bSmokeTest } from "../_shared/e2b-smoke.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) {
      return json({ error: "Não autenticado" }, 401);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    let apiKey = await loadUserE2bApiKey(supabase, userData.user.id);

    if (typeof body?.token === "string" && body.token.trim().startsWith("e2b")) {
      apiKey = body.token.trim();
    }

    if (!apiKey) {
      return json({ error: E2B_SETUP_USER_MESSAGE, code: "e2b_not_configured" }, 403);
    }

    const result = await runE2bSmokeTest(apiKey);

    if (result.ok) {
      const { data: row } = await supabase
        .from("connectors")
        .select("meta")
        .eq("owner_id", userData.user.id)
        .eq("kind", "e2b")
        .maybeSingle();

      const prevMeta = (row?.meta ?? {}) as Record<string, unknown>;
      await supabase
        .from("connectors")
        .update({
          meta: {
            ...prevMeta,
            e2bHealthOk: true,
            e2bHealthCheckedAt: new Date().toISOString(),
            e2bTemplate: result.templateUsed,
            e2bNodeVersion: result.nodeVersion,
            e2bNpmVersion: result.npmVersion,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("owner_id", userData.user.id)
        .eq("kind", "e2b");
    }

    return json({ ok: result.ok, ...result });
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message ?? "erro" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...FORGE_CORS_HEADERS, "Content-Type": "application/json" },
  });
}
