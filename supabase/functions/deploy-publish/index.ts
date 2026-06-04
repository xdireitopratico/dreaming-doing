// deploy-publish — MVP: registra deployment e expõe previewUrl como URL pública.
// Evolução: integração Vercel Deploy API com VERCEL_TOKEN.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    const meta = (project.meta ?? {}) as Record<string, unknown>;
    const previewUrl =
      typeof meta.previewUrl === "string" ? meta.previewUrl.trim() : "";

    const { data: deployment, error: dErr } = await supabase
      .from("deployments")
      .insert({
        project_id: projectId,
        provider: "vercel",
        status: previewUrl ? "ready" : "error",
        url: previewUrl || null,
        logs: previewUrl
          ? "Publish MVP: URL do preview ao vivo."
          : "Sem previewUrl — execute preview-boot antes.",
      })
      .select("id, url, status")
      .single();

    if (dErr) return json({ error: dErr.message }, 500);

    if (previewUrl) {
      await supabase
        .from("projects")
        .update({
          meta: {
            ...meta,
            publishedUrl: previewUrl,
            publishedAt: new Date().toISOString(),
            lastDeploymentId: deployment.id,
          },
        })
        .eq("id", projectId);
    }

    return json({
      deploymentId: deployment.id,
      url: deployment.url,
      status: deployment.status,
      needsPreview: !previewUrl,
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