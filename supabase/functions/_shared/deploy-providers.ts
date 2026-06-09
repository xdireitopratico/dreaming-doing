import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { DeployTarget } from "./stack-context.ts";

export type DeployFile = { path: string; content: string };

export type ProviderDeployResult = {
  ok: boolean;
  url?: string | null;
  status?: string;
  error?: string;
  externalId?: string;
};

const STATIC_EXT =
  /\.(html?|css|js|mjs|cjs|json|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|eot|map|txt|xml|webmanifest)$/i;
const SKIP_PATH_RE = /(^|\/)(node_modules|\.git|\.next|\.vercel|coverage)(\/|$)/;
const MAX_FILE_BYTES = 4_500_000;

export async function loadProjectDeployFiles(
  supabase: SupabaseClient,
  projectId: string,
): Promise<DeployFile[]> {
  const { data, error } = await supabase
    .from("project_files")
    .select("path, content")
    .eq("project_id", projectId);

  if (error) throw new Error(`Falha ao carregar arquivos: ${error.message}`);

  return (data ?? [])
    .filter((row) => {
      const path = String(row.path ?? "");
      if (!path || SKIP_PATH_RE.test(path)) return false;
      const content = String(row.content ?? "");
      return content.length > 0 && content.length <= MAX_FILE_BYTES;
    })
    .map((row) => ({
      path: String(row.path).replace(/^\/+/, ""),
      content: String(row.content),
    }));
}

export function selectDeployBundle(files: DeployFile[]): {
  files: DeployFile[];
  prebuilt: boolean;
  hasPackageJson: boolean;
} {
  if (files.length === 0) {
    return { files: [], prebuilt: false, hasPackageJson: false };
  }

  const distFiles = files
    .filter((f) => f.path.startsWith("dist/"))
    .map((f) => ({ path: f.path.slice("dist/".length), content: f.content }));

  const hasDistIndex = distFiles.some((f) => f.path === "index.html");
  if (hasDistIndex && distFiles.length > 0) {
    return { files: distFiles, prebuilt: true, hasPackageJson: false };
  }

  const staticFiles = files.filter((f) => STATIC_EXT.test(f.path));
  if (staticFiles.some((f) => f.path === "index.html")) {
    return {
      files: staticFiles,
      prebuilt: true,
      hasPackageJson: files.some((f) => f.path === "package.json"),
    };
  }

  const sourceFiles = files.filter((f) => !SKIP_PATH_RE.test(f.path));
  return {
    files: sourceFiles,
    prebuilt: false,
    hasPackageJson: sourceFiles.some((f) => f.path === "package.json"),
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "forge-app";
}

async function buildZip(files: DeployFile[]): Promise<Uint8Array> {
  const { default: JSZip } = await import("https://esm.sh/jszip@3.10.1");
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export async function deployToVercel(
  token: string,
  projectSlug: string,
  files: DeployFile[],
  prebuilt: boolean,
  hasPackageJson: boolean,
  existingProjectId?: string,
): Promise<ProviderDeployResult> {
  if (files.length === 0) {
    return { ok: false, error: "Nenhum arquivo para publicar — gere o build ou adicione index.html." };
  }

  const vercelFiles = files.map((f) => ({ file: f.path, data: f.content }));
  const body: Record<string, unknown> = {
    name: slugify(projectSlug),
    files: vercelFiles,
    target: "production",
  };

  if (existingProjectId) {
    body.project = existingProjectId;
  }

  if (!prebuilt && hasPackageJson) {
    body.projectSettings = {
      framework: "vite",
      buildCommand: "npm run build",
      outputDirectory: "dist",
      installCommand: "npm install",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  const res = await fetch("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  const payload = await res.json().catch(() => ({})) as {
    url?: string;
    id?: string;
    alias?: string[];
    error?: { message?: string };
  };

  if (!res.ok) {
    return {
      ok: false,
      error: payload.error?.message ?? `Vercel API ${res.status}`,
    };
  }

  const url = payload.url
    ? (payload.url.startsWith("http") ? payload.url : `https://${payload.url}`)
    : payload.alias?.[0]
      ? `https://${payload.alias[0]}`
      : null;

  return {
    ok: true,
    url,
    status: "ready",
    externalId: payload.id,
  };
}

export async function deployToNetlify(
  token: string,
  projectSlug: string,
  files: DeployFile[],
  existingSiteId?: string,
): Promise<ProviderDeployResult> {
  if (files.length === 0) {
    return { ok: false, error: "Nenhum arquivo para publicar." };
  }

  let siteId = existingSiteId?.trim();
  if (!siteId) {
    const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  const createRes = await fetch("https://api.netlify.com/api/v1/sites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: `forge-${slugify(projectSlug)}` }),
      signal: controller.signal,
    });
  clearTimeout(timeoutId);
    const created = await createRes.json().catch(() => ({})) as { id?: string; message?: string };
    if (!createRes.ok || !created.id) {
      return {
        ok: false,
        error: created.message ?? `Netlify create site ${createRes.status}`,
      };
    }
    siteId = created.id;
  }

  const zipBytes = await buildZip(files);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/zip",
    },
    body: zipBytes,
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  const deployed = await deployRes.json().catch(() => ({})) as {
    id?: string;
    ssl_url?: string;
    url?: string;
    deploy_url?: string;
    message?: string;
  };

  if (!deployRes.ok) {
    return {
      ok: false,
      error: deployed.message ?? `Netlify deploy ${deployRes.status}`,
    };
  }

  const url = deployed.ssl_url ?? deployed.url ?? deployed.deploy_url ?? null;
  return {
    ok: true,
    url,
    status: "ready",
    externalId: deployed.id ?? siteId,
  };
}

async function resolveCloudflareAccountId(
  token: string,
  storedAccountId?: string,
): Promise<string> {
  if (storedAccountId?.trim()) return storedAccountId.trim();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  const res = await fetch("https://api.cloudflare.com/client/v4/accounts", {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
  const body = await res.json().catch(() => ({})) as {
    result?: { id: string }[];
    errors?: { message?: string }[];
  };
  if (!res.ok) {
    throw new Error(body.errors?.[0]?.message ?? `Cloudflare accounts ${res.status}`);
  }
  const id = body.result?.[0]?.id;
  if (!id) throw new Error("Cloudflare: nenhuma conta encontrada para o token.");
  return id;
}

export async function deployToCloudflare(
  token: string,
  projectSlug: string,
  files: DeployFile[],
  accountId?: string,
  existingProjectName?: string,
): Promise<ProviderDeployResult> {
  if (files.length === 0) {
    return { ok: false, error: "Nenhum arquivo para publicar." };
  }

  const cfAccountId = await resolveCloudflareAccountId(token, accountId);
  const projectName = existingProjectName?.trim() || `forge-${slugify(projectSlug)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  const createRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/pages/projects`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName,
        production_branch: "main",
      }),
      signal: controller.signal,
    },
  );
  clearTimeout(timeoutId);
  if (!createRes.ok && createRes.status !== 409) {
    const errBody = await createRes.json().catch(() => ({})) as {
      errors?: { message?: string }[];
    };
    return {
      ok: false,
      error: errBody.errors?.[0]?.message ?? `Cloudflare create project ${createRes.status}`,
    };
  }

  const zipBytes = await buildZip(files);
  const form = new FormData();
  form.append(
    "file",
    new Blob([zipBytes], { type: "application/zip" }),
    "deploy.zip",
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  const deployRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/pages/projects/${projectName}/deployments`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    },
  );
  clearTimeout(timeoutId);

  const deployed = await deployRes.json().catch(() => ({})) as {
    result?: { url?: string; id?: string };
    errors?: { message?: string }[];
  };

  if (!deployRes.ok) {
    return {
      ok: false,
      error: deployed.errors?.[0]?.message ?? `Cloudflare deploy ${deployRes.status}`,
    };
  }

  return {
    ok: true,
    url: deployed.result?.url ?? `https://${projectName}.pages.dev`,
    status: "ready",
    externalId: deployed.result?.id,
  };
}

export async function deployWithProvider(
  provider: DeployTarget,
  input: {
    token: string;
    projectSlug: string;
    files: DeployFile[];
    prebuilt: boolean;
    hasPackageJson: boolean;
    meta: Record<string, unknown>;
    connectorMeta?: Record<string, unknown>;
  },
): Promise<ProviderDeployResult> {
  const { token, projectSlug, files, prebuilt, hasPackageJson, meta, connectorMeta } = input;

  if (provider === "vercel") {
    const vercelProjectId = typeof meta.vercelProjectId === "string"
      ? meta.vercelProjectId
      : undefined;
    return deployToVercel(token, projectSlug, files, prebuilt, hasPackageJson, vercelProjectId);
  }

  if (provider === "netlify") {
    const netlifySiteId = typeof meta.netlifySiteId === "string" ? meta.netlifySiteId : undefined;
    return deployToNetlify(token, projectSlug, files, netlifySiteId);
  }

  if (provider === "cloudflare") {
    const accountId = typeof connectorMeta?.accountId === "string"
      ? connectorMeta.accountId
      : undefined;
    const cfProjectName = typeof meta.cloudflarePagesProject === "string"
      ? meta.cloudflarePagesProject
      : undefined;
    return deployToCloudflare(token, projectSlug, files, accountId, cfProjectName);
  }

  return { ok: false, error: `Provider ${provider} não suporta deploy de produção.` };
}