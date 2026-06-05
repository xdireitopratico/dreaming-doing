// preview-boot — Vite no sandbox E2B (reutiliza sandbox do agente quando existir)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPlatformSecret } from "../_shared/platform-secrets.ts";
import { E2B_PROJECT_DIR } from "../_shared/e2b.ts";
import {
  connectProjectSandboxForPreview,
  previewUrlFromSandbox,
  readSandboxMeta,
  syncProjectFilesToSandbox,
} from "../_shared/project-sandbox.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PREVIEW_TTL_MS = 25 * 60 * 1000;
const PROBE_ATTEMPTS = 6;
const PROBE_INTERVAL_MS = 2000;
const PROBE_FETCH_MS = 4000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { projectId } = await req.json();
    if (!projectId) return json({ error: "projectId obrigatório" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const E2B_API_KEY = await getPlatformSecret(supabase, "E2B_API_KEY");
    if (!E2B_API_KEY) {
      return json({
        error: "E2B_API_KEY ausente. Configure em Ajustes (admin) ou Supabase Edge Secrets.",
      }, 500);
    }

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

    const { data: project } = await supabase
      .from("projects").select("id, owner_id, meta").eq("id", projectId).single();
    if (!project || project.owner_id !== userData.user.id) {
      return json({ error: "Projeto não encontrado" }, 404);
    }

    const existing = (project.meta ?? {}) as Record<string, unknown>;
    const { data: files } = await supabase
      .from("project_files").select("path, content").eq("project_id", projectId);

    const devPort = Number.parseInt(detectDevPort(files ?? []), 10) || 5173;
    const devCmd = detectDevCommand(files ?? [], devPort);

    const { sandbox, sandboxId, reused } = await connectProjectSandboxForPreview(
      supabase,
      projectId,
      E2B_API_KEY,
    );

    await syncProjectFilesToSandbox(sandbox, files ?? []);

    const installAndDev =
      `cd ${E2B_PROJECT_DIR} && (test -f package.json && npm install --no-audit --no-fund --loglevel=error 2>&1 | tail -20 || true) && nohup ${devCmd} > /tmp/forge-dev.log 2>&1 &`;

    await sandbox.commands.run(installAndDev, {
      cwd: E2B_PROJECT_DIR,
      timeoutMs: 120_000,
      background: true,
    });

    let url = previewUrlFromSandbox(sandbox, devPort);
    let ready = false;

    for (let i = 0; i < PROBE_ATTEMPTS; i++) {
      try {
        const probe = await fetch(url, { method: "GET", signal: AbortSignal.timeout(PROBE_FETCH_MS) });
        if (probe.ok || (probe.status >= 200 && probe.status < 500)) {
          ready = true;
          break;
        }
      } catch { /* Vite ainda subindo */ }
      await new Promise((r) => setTimeout(r, PROBE_INTERVAL_MS));
    }

    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();

    await supabase.from("projects").update({
      meta: {
        ...existing,
        previewUrl: url,
        previewExpiresAt: expiresAt,
        previewSandboxId: sandboxId,
        previewPort: devPort,
        previewReady: ready,
      },
    }).eq("id", projectId);

    return json({ url, expiresAt, sandboxId, reused, ready });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro inesperado";
    console.error("[preview-boot]", msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function detectDevPort(files: Array<{ path: string; content?: string | null }>): string {
  const pkg = files.find((f) => f.path === "package.json" || f.path === "/package.json");
  if (pkg?.content) {
    try {
      const scripts = (JSON.parse(pkg.content) as { scripts?: Record<string, string> }).scripts;
      const dev = scripts?.dev ?? scripts?.start ?? "";
      const m = dev.match(/--port\s+(\d{2,5})/) ?? dev.match(/:(\d{2,5})/);
      if (m?.[1]) return m[1];
    } catch { /* ignore */ }
  }
  const vite = files.find((f) => f.path.includes("vite.config"));
  if (vite?.content) {
    const m = vite.content.match(/port:\s*(\d{2,5})/);
    if (m?.[1]) return m[1];
  }
  return "5173";
}

function detectDevCommand(files: Array<{ path: string; content?: string | null }>, port: number): string {
  const pkg = files.find((f) => f.path === "package.json" || f.path === "/package.json");
  if (pkg?.content) {
    try {
      const scripts = (JSON.parse(pkg.content) as { scripts?: Record<string, string> }).scripts;
      if (scripts?.dev) {
        const dev = scripts.dev;
        if (dev.includes("vite") && !dev.includes("--host")) {
          return `npm run dev -- --host 0.0.0.0 --port ${port}`;
        }
        return `env HOST=0.0.0.0 PORT=${port} npm run dev`;
      }
      if (scripts?.start) return `env HOST=0.0.0.0 PORT=${port} npm start`;
    } catch { /* ignore */ }
  }
  return `npx vite --host 0.0.0.0 --port ${port}`;
}