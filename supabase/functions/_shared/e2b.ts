/** Helpers E2B — API v2 (api.e2b.app, preview {port}-{sandboxId}.e2b.app). */

export const E2B_API_BASE = Deno.env.get("E2B_API_BASE") || "https://api.e2b.app";
export const E2B_DOMAIN = Deno.env.get("E2B_DOMAIN") || "e2b.app";
/** Template com Node/npm para Vite (alias E2B: code-interpreter-v1). */
export const E2B_TEMPLATE_DEFAULT = Deno.env.get("E2B_TEMPLATE") || "code-interpreter-v1";
export const E2B_PROJECT_DIR = "/home/user";

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

/** Cria sandbox via REST (sem SDK pesado no cold start). */
export async function e2bCreateSandbox(
  apiKey: string,
  templateID = E2B_TEMPLATE_DEFAULT,
  timeoutSeconds = 1800,
): Promise<{ sandboxID: string; raw: Record<string, unknown> }> {
  const resp = await fetch(`${E2B_API_BASE}/sandboxes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      templateID,
      timeout: timeoutSeconds,
      allow_internet_access: true,
    }),
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

export async function e2bDeleteSandbox(apiKey: string, sandboxId: string): Promise<void> {
  try {
    await fetch(`${E2B_API_BASE}/sandboxes/${sandboxId}`, {
      method: "DELETE",
      headers: { "X-API-Key": apiKey },
    });
  } catch {
    /* ignore */
  }
}