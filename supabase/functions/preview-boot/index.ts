// preview-boot/index.ts — Sobe o dev server (Vite) num sandbox E2B,
// sincroniza project_files e devolve a URL pública.
// Idempotente: se já houver previewUrl recente em projects.meta, reusa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPlatformSecret } from "../_shared/platform-secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const E2B_BASE = "https://api.e2b.dev";
const PREVIEW_TTL_MS = 25 * 60 * 1000; // 25 min — antes do timeout E2B de 30min

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { projectId, force } = await req.json();
    if (!projectId) return json({ error: "projectId obrigatório" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const E2B_API_KEY = await getPlatformSecret(supabase, "E2B_API_KEY");
    const E2B_TEMPLATE = (await getPlatformSecret(supabase, "E2B_TEMPLATE")) || "nodejs";
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

    // Reuso se ainda fresco
    const existing = (project.meta ?? {}) as any;
    if (!force && existing.previewUrl && existing.previewExpiresAt) {
      const exp = new Date(existing.previewExpiresAt).getTime();
      if (exp > Date.now() + 60_000) {
        return json({ url: existing.previewUrl, expiresAt: existing.previewExpiresAt, reused: true });
      }
    }

    // Cria sandbox
    const sb = await fetch(`${E2B_BASE}/sandboxes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": E2B_API_KEY },
      body: JSON.stringify({ templateID: E2B_TEMPLATE, timeout_ms: 30 * 60 * 1000 }),
    });
    if (!sb.ok) return json({ error: `E2B create: ${sb.status} ${await sb.text()}` }, 500);
    const sbData = await sb.json();
    const sandboxId = sbData.sandboxID;

    // Carrega project_files
    const { data: files } = await supabase
      .from("project_files").select("path, content").eq("project_id", projectId);
    const tree: Record<string, string> = {};
    for (const f of files ?? []) tree[`/home/project/${f.path}`] = f.content ?? "";

    const writeResp = await fetch(`${E2B_BASE}/sandboxes/${sandboxId}/filesystem/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": E2B_API_KEY },
      body: JSON.stringify(tree),
    });
    if (!writeResp.ok) {
      return json({ error: `E2B write: ${writeResp.status} ${await writeResp.text()}` }, 500);
    }

    // npm install + dev server em background
    const cmd = `cd /home/project && (npm install --no-audit --no-fund --loglevel=error 2>&1 | tail -30) && nohup npm run dev > /tmp/dev.log 2>&1 &`;
    const exec = await fetch(`${E2B_BASE}/sandboxes/${sandboxId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": E2B_API_KEY },
      body: JSON.stringify({ cmd, cwd: "/home/project", timeout_ms: 180_000 }),
    });
    if (!exec.ok) {
      return json({ error: `E2B exec: ${exec.status} ${await exec.text()}` }, 500);
    }

    const url = `https://${sandboxId}-5173.e2b.dev`;
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();

    await supabase.from("projects").update({
      meta: { ...existing, previewUrl: url, previewExpiresAt: expiresAt, previewSandboxId: sandboxId },
    }).eq("id", projectId);

    return json({ url, expiresAt, sandboxId, reused: false });
  } catch (e: any) {
    return json({ error: e?.message ?? "erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
