// project-delete — encerra sandbox E2B do projeto e remove o registro (CASCADE nos filhos)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadUserE2bApiKey } from "../_shared/user-e2b.ts";
import { killProjectSandbox, readSandboxMeta } from "../_shared/project-sandbox.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { projectId } = await req.json();
    if (!projectId) return json({ error: "projectId obrigatório" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

    const { data: project } = await supabase
      .from("projects")
      .select("id, owner_id, meta")
      .eq("id", projectId)
      .single();

    if (!project || project.owner_id !== userData.user.id) {
      return json({ error: "Projeto não encontrado" }, 404);
    }

    const sm = readSandboxMeta((project.meta ?? {}) as Record<string, unknown>);
    const e2bKey = await loadUserE2bApiKey(supabase, userData.user.id);
    if (e2bKey && sm.previewSandboxId) {
      await killProjectSandbox(e2bKey, sm.previewSandboxId);
    }

    const { error: delErr } = await supabase.from("projects").delete().eq("id", projectId);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ ok: true });
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