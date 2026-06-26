// e2b-cleanup — lista/encerra sandboxes órfãos ou por ID (fantasmas legados)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { e2bDeleteSandboxWithRetry, e2bListSandboxes } from "../_shared/e2b.ts";
import { listForgeOrphanSandboxes } from "../_shared/project-sandbox.ts";
import { loadUserE2bApiKey } from "../_shared/user-e2b.ts";
import { forgeOrigin } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Body = {
  action?: "list" | "orphans" | "purge-orphans" | "kill";
  sandboxId?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

    const e2bKey = await loadUserE2bApiKey(supabase, userData.user.id);
    if (!e2bKey) return json({ error: "Chave E2B não configurada em /api" }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;
    const action = body.action ?? "orphans";

    if (action === "list") {
      const sandboxes = await e2bListSandboxes(e2bKey);
      return json({ ok: true, sandboxes });
    }

    if (action === "orphans") {
      const orphans = await listForgeOrphanSandboxes(e2bKey, supabase);
      return json({ ok: true, orphans });
    }

    if (action === "purge-orphans") {
      const orphans = await listForgeOrphanSandboxes(e2bKey, supabase);
      const killed: string[] = [];
      const failed: string[] = [];
      for (const o of orphans) {
        const ok = await e2bDeleteSandboxWithRetry(e2bKey, o.sandboxID);
        if (ok) killed.push(o.sandboxID);
        else failed.push(o.sandboxID);
      }
      return json({ ok: failed.length === 0, orphans, killed, failed });
    }

    if (action === "kill") {
      const sandboxId = body.sandboxId?.trim();
      if (!sandboxId) return json({ error: "sandboxId obrigatório" }, 400);
      const ok = await e2bDeleteSandboxWithRetry(e2bKey, sandboxId);
      return json({ ok, sandboxId, killed: ok ? [sandboxId] : [], failed: ok ? [] : [sandboxId] });
    }

    return json({ error: "action inválida" }, 400);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro inesperado";
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
