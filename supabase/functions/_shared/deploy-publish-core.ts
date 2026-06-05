import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildStackContext, type DeployTarget } from "./stack-context.ts";
import { loadDeployConnectorKeys } from "../agent-run/connector-keys.ts";

export type DeployPublishResult = {
  ok: boolean;
  deploymentId?: string;
  url?: string | null;
  status?: string;
  provider?: DeployTarget;
  needsPreview?: boolean;
  error?: string;
};

const providerNote: Record<DeployTarget, string> = {
  vercel: "Vercel — conecte token em Conectores para deploy API completo.",
  netlify: "Netlify — conecte token em Conectores; build: npm run build && netlify deploy.",
  cloudflare: "Cloudflare Pages — use wrangler/pages com token conectado.",
  e2b: "Preview E2B — use preview ao vivo; deploy produção via Vercel/Netlify.",
};

/** Lógica compartilhada entre Edge deploy-publish e tool deploy_publish do agente (+3). */
export async function executeDeployPublish(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<DeployPublishResult> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id, meta")
    .eq("id", projectId)
    .single();

  if (!project || project.owner_id !== userId) {
    return { ok: false, error: "Projeto não encontrado" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("integration_prefs")
    .eq("id", userId)
    .maybeSingle();

  const meta = (project.meta ?? {}) as Record<string, unknown>;
  const previewUrl = typeof meta.previewUrl === "string" ? meta.previewUrl.trim() : "";
  const deployKeys = await loadDeployConnectorKeys(supabase, userId);
  const stack = buildStackContext(profile?.integration_prefs, meta, deployKeys);
  const provider = stack.deployTarget;

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

  if (dErr) return { ok: false, error: dErr.message };

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

  return {
    ok: true,
    deploymentId: deployment.id,
    url: deployment.url,
    status: deployment.status,
    provider,
    needsPreview: !previewUrl,
  };
}