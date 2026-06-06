// preview-boot — Vite no sandbox E2B via REST (sem npm:e2b)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadUserE2bApiKey, E2B_SETUP_USER_MESSAGE } from "../_shared/user-e2b.ts";
import {
  connectProjectSandboxForPreview,
  ensureAgentProjectSandbox,
  previewUrlFromSandbox,
  syncProjectFilesToSandbox,
} from "../_shared/project-sandbox.ts";
import {
  bootDevServerInSandbox,
  detectDevPort,
  isCachedPreviewValid,
  PREVIEW_TTL_MS,
  probePreviewUrl,
  readDevLogTail,
} from "../_shared/preview-dev.ts";
import { FORGE_CORS_HEADERS, corsPreflightResponse } from "../_shared/cors.ts";

const corsHeaders = FORGE_CORS_HEADERS;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const body = (await req.json()) as {
      projectId?: string;
      force?: boolean;
      probeOnly?: boolean;
    };
    const { projectId, force, probeOnly } = body;
    if (!projectId) return json({ error: "projectId obrigatório" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

    const E2B_API_KEY = await loadUserE2bApiKey(supabase, userData.user.id);
    if (!E2B_API_KEY) {
      return json({ error: E2B_SETUP_USER_MESSAGE, code: "e2b_not_configured" }, 403);
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id, owner_id, meta")
      .eq("id", projectId)
      .single();
    if (!project || project.owner_id !== userData.user.id) {
      return json({ error: "Projeto não encontrado" }, 404);
    }

    const existing = (project.meta ?? {}) as Record<string, unknown>;
    const cached = isCachedPreviewValid(existing, force);

    if (probeOnly && cached) {
      const ready = await probePreviewUrl(cached.url, 2);
      if (ready) {
        await supabase
          .from("projects")
          .update({
            meta: { ...existing, previewReady: true },
          })
          .eq("id", projectId);
      }
      return json({
        url: cached.url,
        expiresAt: cached.expiresAt,
        reused: true,
        ready,
        probeOnly: true,
      });
    }

    if (cached && !force) {
      return json({
        url: cached.url,
        expiresAt: cached.expiresAt,
        reused: true,
        ready: existing.previewReady === true,
      });
    }

    const { data: files } = await supabase
      .from("project_files")
      .select("path, content")
      .eq("project_id", projectId);

    const devPort = Number.parseInt(detectDevPort(files ?? []), 10) || 5173;

    let sandboxResult;
    try {
      sandboxResult = await connectProjectSandboxForPreview(supabase, projectId, E2B_API_KEY);
    } catch (previewErr: unknown) {
      const msg = previewErr instanceof Error ? previewErr.message : "";
      if (msg.includes("Ainda não há") || msg.includes("ambiente ao vivo")) {
        sandboxResult = await ensureAgentProjectSandbox(supabase, projectId, E2B_API_KEY);
      } else {
        throw previewErr;
      }
    }
    const { sandbox, sandboxId, reused } = sandboxResult;

    await syncProjectFilesToSandbox(sandbox, files ?? []);

    const { installOk } = await bootDevServerInSandbox(sandbox, files ?? [], devPort);

    let url = previewUrlFromSandbox(sandbox, devPort);
    let ready = await probePreviewUrl(url);

    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
    const logs = ready ? undefined : await readDevLogTail(sandbox);

    await supabase
      .from("projects")
      .update({
        meta: {
          ...existing,
          previewUrl: url,
          previewExpiresAt: expiresAt,
          previewSandboxId: sandboxId,
          previewPort: devPort,
          previewReady: ready,
        },
      })
      .eq("id", projectId);

    return json({
      url,
      expiresAt,
      sandboxId,
      reused,
      ready,
      installOk,
      logs: logs && !ready ? logs : undefined,
    });
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
