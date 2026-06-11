import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildStackContext, type DeployTarget } from "./stack-context.ts";
import { loadDeployConnectorKeys } from "../agent-run/connector-keys.ts";
import {
  deployWithProvider,
  loadProjectDeployFiles,
  selectDeployBundle,
} from "./deploy-providers.ts";

export type DeployPublishResult = {
  ok: boolean;
  deploymentId?: string;
  url?: string | null;
  status?: string;
  provider?: DeployTarget;
  needsPreview?: boolean;
  error?: string;
};

const TOKEN_KEY: Record<Exclude<DeployTarget, "e2b">, string> = {
  vercel: "VERCEL_TOKEN",
  netlify: "NETLIFY_TOKEN",
  cloudflare: "CLOUDFLARE_API_TOKEN",
};

const CONNECTOR_KIND: Record<Exclude<DeployTarget, "e2b">, string> = {
  vercel: "vercel",
  netlify: "netlify",
  cloudflare: "cloudflare",
};

/** Lógica compartilhada entre Edge deploy-publish e tool deploy_publish do agente. */
export async function executeDeployPublish(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<DeployPublishResult> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id, name, meta")
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

  if (provider === "e2b") {
    if (!previewUrl) {
      return {
        ok: false,
        error:
          "Sem preview ativo — inicie o preview E2B ou conecte Vercel/Netlify/Cloudflare em Conectores.",
        provider,
        needsPreview: true,
      };
    }
    return recordDeployment(supabase, projectId, provider, previewUrl, meta, {
      logs: "Publish via preview E2B (sem token de produção conectado).",
    });
  }

  const tokenKey = TOKEN_KEY[provider];
  const token = deployKeys[tokenKey];
  if (!token) {
    return {
      ok: false,
      error: `Conecte ${provider} em Conectores (token ${tokenKey} ausente).`,
      provider,
    };
  }

  let connectorMeta: Record<string, unknown> = {};
  const { data: connectorRow } = await supabase
    .from("connectors")
    .select("meta")
    .eq("owner_id", userId)
    .eq("kind", CONNECTOR_KIND[provider])
    .maybeSingle();
  if (connectorRow?.meta && typeof connectorRow.meta === "object") {
    connectorMeta = connectorRow.meta as Record<string, unknown>;
  }

  const allFiles = await loadProjectDeployFiles(supabase, projectId);
  const bundle = selectDeployBundle(allFiles);
  if (bundle.files.length === 0) {
    return {
      ok: false,
      error:
        "Projeto sem arquivos publicáveis — execute o build (dist/) ou adicione arquivos estáticos.",
      provider,
    };
  }

  const deployResult = await deployWithProvider(provider, {
    token,
    projectSlug: project.name ?? projectId.slice(0, 8),
    files: bundle.files,
    prebuilt: bundle.prebuilt,
    hasPackageJson: bundle.hasPackageJson,
    meta,
    connectorMeta,
  });

  if (!deployResult.ok) {
    const { data: deployment } = await supabase
      .from("deployments")
      .insert({
        project_id: projectId,
        provider,
        status: "error",
        url: null,
        logs: deployResult.error ?? "Falha no deploy",
      })
      .select("id")
      .single();

    return {
      ok: false,
      deploymentId: deployment?.id,
      error: deployResult.error,
      provider,
      status: "error",
    };
  }

  const url = deployResult.url ?? (previewUrl || null);
  const nextMeta: Record<string, unknown> = {
    ...meta,
    publishedUrl: url,
    publishedAt: new Date().toISOString(),
    deployTarget: provider,
  };
  if (provider === "netlify" && deployResult.externalId && !meta.netlifySiteId) {
    nextMeta.netlifySiteId = deployResult.externalId;
  }
  if (provider === "vercel" && deployResult.externalId && !meta.vercelDeploymentId) {
    nextMeta.vercelDeploymentId = deployResult.externalId;
  }

  return recordDeployment(supabase, projectId, provider, url, nextMeta, {
    logs: `Deploy ${provider} concluído.`,
    deploymentStatus: deployResult.status ?? "ready",
  });
}

async function recordDeployment(
  supabase: SupabaseClient,
  projectId: string,
  provider: DeployTarget,
  url: string | null,
  projectMeta: Record<string, unknown>,
  opts: { logs: string; deploymentStatus?: string },
): Promise<DeployPublishResult> {
  const { data: deployment, error: dErr } = await supabase
    .from("deployments")
    .insert({
      project_id: projectId,
      provider,
      status: url ? (opts.deploymentStatus ?? "ready") : "error",
      url,
      logs: opts.logs,
    })
    .select("id, url, status")
    .single();

  if (dErr) return { ok: false, error: dErr.message, provider };

  if (url) {
    await supabase
      .from("projects")
      .update({
        meta: {
          ...projectMeta,
          lastDeploymentId: deployment.id,
        },
      })
      .eq("id", projectId);
  }

  return {
    ok: !!url,
    deploymentId: deployment.id,
    url: deployment.url,
    status: deployment.status,
    provider,
    needsPreview: !url,
    error: url ? undefined : "Deploy sem URL pública",
  };
}
