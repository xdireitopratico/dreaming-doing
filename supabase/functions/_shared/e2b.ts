/** Helpers E2B — API v2 (api.e2b.app, preview {port}-{sandboxId}.e2b.app). */

export const E2B_API_BASE = Deno.env.get("E2B_API_BASE") || "https://api.e2b.app";
export const E2B_DOMAIN = Deno.env.get("E2B_DOMAIN") || "e2b.app";
/** Template preferido com Node/npm (nodejs foi removido pela E2B). */
export const E2B_TEMPLATE_PREFERRED = "code-interpreter-v1";

/** Override opcional via Edge secret E2B_TEMPLATE. */
export const E2B_TEMPLATE_DEFAULT = Deno.env.get("E2B_TEMPLATE")?.trim() || E2B_TEMPLATE_PREFERRED;

/** Ordem de tentativa na criação — só persiste sandbox após smoke npm. */
export function e2bTemplateCandidates(requested?: string): string[] {
  const req = requested?.trim();
  return [...new Set([
    req,
    E2B_TEMPLATE_DEFAULT,
    E2B_TEMPLATE_PREFERRED,
    "code-interpreter",
  ].filter((t): t is string => !!t))];
}

export const E2B_TEMPLATE_CANDIDATES = e2bTemplateCandidates();

export const E2B_PROJECT_DIR = "/home/user";

/** Metadata E2B para rastrear sandboxes por projeto (cleanup no project-delete). */
export const FORGE_E2B_APP = "dreaming-doing";
export const FORGE_PROJECT_META_KEY = "forge_project_id";

export function forgeSandboxMetadata(projectId: string): Record<string, string> {
  return {
    forge_app: FORGE_E2B_APP,
    [FORGE_PROJECT_META_KEY]: projectId,
  };
}

export type ListedE2bSandbox = {
  sandboxID: string;
  templateID?: string;
  state?: string;
  metadata?: Record<string, string>;
};

/** URL pública do serviço no sandbox (Vite, etc.). Preferir `getHost` do SDK quando disponível. */
export function e2bPreviewUrl(sandboxId: string, port: number | string): string {
  const p = typeof port === "string" ? port : String(port);
  return `https://${p}-${sandboxId}.${E2B_DOMAIN}`;
}

/** Garante Vite aceita host E2B (*.e2b.app) e HMR via HTTPS. */
export function patchViteConfigForE2b(content: string): string {
  if (!content.includes("defineConfig")) return content;
  let out = content;
  if (!/allowedHosts/i.test(out)) {
    if (/server:\s*\{/.test(out)) {
      out = out.replace(/server:\s*\{/, 'server: { allowedHosts: true, ');
    } else {
      out = out.replace(
        /defineConfig\(\s*\{/,
        "defineConfig({\n  server: { host: \"0.0.0.0\", port: 5173, allowedHosts: true, hmr: { clientPort: 443 } },",
      );
    }
  }
  if (!/host:\s*["']0\.0\.0\.0["']/.test(out) && /server:\s*\{/.test(out)) {
    out = out.replace(/server:\s*\{/, 'server: { host: "0.0.0.0", ');
  }
  return out;
}

export function patchProjectFilesForE2b(
  files: Array<{ path: string; content?: string | null }>,
): Array<{ path: string; data: string }> {
  return files.map((f) => {
    const path = f.path.replace(/^\//, "");
    let data = f.content ?? "";
    if (path.includes("vite.config")) {
      data = patchViteConfigForE2b(data);
    }
    if (path === "package.json" && data.includes('"dev"')) {
      if (!data.includes("--host")) {
        data = data.replace(
          /"dev"\s*:\s*"([^"]*)"/,
          (_, script: string) =>
            `"dev": "${script}${script.includes("vite") ? " --host 0.0.0.0" : ""}"`,
        );
      }
    }
    return { path: normalizeProjectPath(f.path), data };
  });
}

export function normalizeProjectPath(path: string): string {
  const clean = path.replace(/^\//, "");
  return `${E2B_PROJECT_DIR}/${clean}`;
}

export type E2bCreateOpts = {
  templateID?: string;
  timeoutSeconds?: number;
  metadata?: Record<string, string>;
  /** E2B SDK v2+ usa secure por padrão — necessário para envdAccessToken e comandos. */
  secure?: boolean;
};

/** Cria sandbox via REST (sem SDK pesado no cold start). */
export async function e2bCreateSandbox(
  apiKey: string,
  templateIDOrOpts: string | E2bCreateOpts = E2B_TEMPLATE_DEFAULT,
  timeoutSeconds = 1800,
  metadata?: Record<string, string>,
): Promise<{ sandboxID: string; raw: Record<string, unknown> }> {
  const opts: E2bCreateOpts = typeof templateIDOrOpts === "string"
    ? { templateID: templateIDOrOpts, timeoutSeconds, metadata }
    : templateIDOrOpts;
  const templateID = opts.templateID ?? E2B_TEMPLATE_DEFAULT;
  const timeout = opts.timeoutSeconds ?? 1800;
  const meta = opts.metadata;

  const body: Record<string, unknown> = {
    templateID,
    timeout,
    allow_internet_access: true,
    secure: opts.secure ?? true,
  };
  if (meta && Object.keys(meta).length > 0) body.metadata = meta;

  const resp = await fetch(`${E2B_API_BASE}/sandboxes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`E2B create ${resp.status}: ${text.slice(0, 400)}`);
  }

  const data = JSON.parse(text) as { sandboxID?: string; sandboxId?: string };
  const sandboxID = data.sandboxID ?? data.sandboxId;
  if (!sandboxID) throw new Error("E2B create: resposta sem sandboxID");
  return { sandboxID, raw: data as Record<string, unknown> };
}

/** Lista sandboxes em execução; filtro opcional por metadata (ex.: forge_project_id). */
export async function e2bListSandboxes(
  apiKey: string,
  metadata?: Record<string, string>,
): Promise<ListedE2bSandbox[]> {
  const params = new URLSearchParams();
  if (metadata) {
    for (const [k, v] of Object.entries(metadata)) params.append(k, v);
  }
  const qs = params.toString();
  const url = `${E2B_API_BASE}/sandboxes${qs ? `?metadata=${encodeURIComponent(qs)}` : ""}`;
  const resp = await fetch(url, { headers: { "X-API-Key": apiKey } });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`E2B list ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text) as Array<Record<string, unknown>>;
  return data.map((row) => ({
    sandboxID: String(row.sandboxID ?? row.sandboxId ?? ""),
    templateID: typeof row.templateID === "string" ? row.templateID : undefined,
    state: typeof row.state === "string" ? row.state : undefined,
    metadata: row.metadata as Record<string, string> | undefined,
  })).filter((s) => s.sandboxID.length > 0);
}

export async function e2bDeleteSandbox(apiKey: string, sandboxId: string): Promise<boolean> {
  try {
    const resp = await fetch(`${E2B_API_BASE}/sandboxes/${encodeURIComponent(sandboxId)}`, {
      method: "DELETE",
      headers: { "X-API-Key": apiKey },
    });
    if (resp.status === 204 || resp.status === 404) return true;
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.warn(`[e2b] delete ${sandboxId} HTTP ${resp.status}: ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[e2b] delete ${sandboxId} failed:`, e);
    return false;
  }
}

/** Tenta encerrar sandbox com uma retentativa curta (falhas transitórias). */
export async function e2bDeleteSandboxWithRetry(
  apiKey: string,
  sandboxId: string,
  attempts = 2,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await e2bDeleteSandbox(apiKey, sandboxId)) return true;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}