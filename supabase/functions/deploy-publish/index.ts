// deploy-publish — registra deployment conforme alvo (Vercel / Netlify / Cloudflare / preview E2B)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { executeDeployPublish } from "../_shared/deploy-publish-core.ts";
import { forgeOrigin } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
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

    const result = await executeDeployPublish(supabase, projectId, userData.user.id);
    if (!result.ok)
      return json(
        { error: result.error ?? "Falha ao publicar" },
        result.error === "Projeto não encontrado" ? 404 : 500,
      );

    return json({
      deploymentId: result.deploymentId,
      url: result.url,
      status: result.status,
      provider: result.provider,
      needsPreview: result.needsPreview,
    });
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
