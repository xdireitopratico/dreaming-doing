// deploy-publish — registra deployment conforme alvo (Vercel / Netlify / Cloudflare / preview E2B)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildStackContext, type DeployTarget } from "../_shared/stack-context.ts";
import { loadDeployConnectorKeys } from "../agent-run/connector-keys.ts";

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

    const { data: profile } = await supabase
      .from("profiles")
      .select("integration_prefs")
      .eq("id", userData.user.id)
      .maybeSingle();

    const meta = (project.meta ?? {}) as Record<string, unknown>;
    const previewUrl = typeof meta.previewUrl === "string" ? meta.previewUrl.trim() : "";
    const deployKeys = await loadDeployConnectorKeys(supabase, userData.user.id);
    const stack = buildStackContext(profile?.integration_prefs, meta, deployKeys);
    const provider = stack.deployTarget as DeployTarget;

    const providerNote: Record<DeployTarget, string> = {
      vercel: "Vercel — conecte token em Conectores para deploy API completo.",
      netlify: "Netlify — conecte token em Conectores; build: npm run build && netlify deploy.",
      cloudflare: "Cloudflare Pages — use wrangler/pages com token conectado.",
      e2b: "Preview E2B — use preview ao vivo; deploy produção via Vercel/Netlify.",
    };

    const { data: deployment, error: dErr } = await supabase
      .from("deployments")
      .insert({
        project_id: projectId,
        provider,
        status: previewUrl ? "ready" : "error",
        url: previewUrl || null,
        logs: previewUrl
          ? `Publish: ${providerNote[provider]} URL do preview ao vivo.`
          : `Sem previewUrl — inicie preview E2B ou configure ${provider}.`,
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
            deployTarget: provider,
          },
        })
        .eq("id", projectId);
    }

    return json({
      deploymentId: deployment.id,
      url: deployment.url,
      status: deployment.status,
      provider,
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