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
  PROBE_ATTEMPTS_AFTER_BOOT,
  probePreviewUrl,
  probePreviewUrlStatus,
  readDevLogTail,
} from "../_shared/preview-dev.ts";
import { autoPublishIfNeeded } from "../_shared/auto-publish.ts";
import {
  getDeploymentController,
  cleanupDeploymentController,
} from "../_shared/deploy-providers.ts";
import { FORGE_CORS_HEADERS, corsPreflightResponse } from "../_shared/cors.ts";

const corsHeaders = FORGE_CORS_HEADERS;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Warm module-level controller before autoPublishIfNeeded → deployWithProvider (TDZ guard).
getDeploymentController();

type ProjectFile = { path: string; content?: string | null };

function clearedPreviewMeta(existing: Record<string, unknown>): Record<string, unknown> {
  const next = { ...existing };
  delete next.previewUrl;
  delete next.previewExpiresAt;
  delete next.previewSandboxId;
  delete next.previewReady;
  delete next.previewPort;
  return next;
}

async function loadProjectFiles(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<ProjectFile[]> {
  const { data: files, error } = await supabase
    .from("project_files")
    .select("path, content")
    .eq("project_id", projectId);
  if (error) {
    console.error("[preview-boot] loadProjectFiles failed:", error.message);
    return [];
  }
  return files ?? [];
}

async function connectSandboxForPreview(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  apiKey: string,
) {
  try {
    return await connectProjectSandboxForPreview(supabase, projectId, apiKey);
  } catch (previewErr: unknown) {
    const msg = previewErr instanceof Error ? previewErr.message : "";
    if (msg.includes("Ainda não há") || msg.includes("ambiente ao vivo")) {
      const files = await loadProjectFiles(supabase, projectId);
      if (files.length === 0) {
        throw new Error("Projeto sem arquivos — o agente ainda não gerou código.");
      }
      return await ensureAgentProjectSandbox(supabase, projectId, apiKey);
    }
    throw previewErr;
  }
}

/** Reconecta sandbox, sync e sobe Vite quando a porta (ex. 5173) morreu. */
async function rebootPreviewDevServer(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  apiKey: string,
  files: ProjectFile[],
  devPort: number,
  previewUrl: string,
): Promise<{ ready: boolean; sandboxId: string; url: string; installOk: boolean; logs?: string }> {
  const { sandbox, sandboxId } = await connectSandboxForPreview(supabase, projectId, apiKey);
  await syncProjectFilesToSandbox(sandbox, files);
  const { installOk } = await bootDevServerInSandbox(sandbox, files, devPort);
  const freshUrl = previewUrlFromSandbox(sandbox, devPort);
  const ready = await probePreviewUrl(freshUrl, PROBE_ATTEMPTS_AFTER_BOOT);
  let logs: string | undefined;
  if (!ready) {
    logs = await readDevLogTail(sandbox);
    console.warn("[preview-boot] Vite ainda não respondeu:", logs.slice(0, 400));
  }
  return { ready, sandboxId, url: freshUrl, installOk, logs };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const body = (await req.json()) as {
      projectId?: string;
      force?: boolean;
      probeOnly?: boolean;
      syncOnly?: boolean;
      /** P3 fix: indica se boot veio de user action ou auto-run. */
      userInitiated?: boolean;
    };
    const { projectId, force, probeOnly, syncOnly, userInitiated } = body;
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
    let cached = isCachedPreviewValid(existing, force);

    const devPortFromMeta = typeof existing.previewPort === "number" ? existing.previewPort : null;

    let syncOnlyMissedSandbox = false;

    if (syncOnly) {
      const projectFiles = await loadProjectFiles(supabase, projectId);
      if (projectFiles.length === 0) {
        return json(
          {
            url: null,
            ready: false,
            reused: false,
            error: "Projeto sem arquivos — o agente ainda não gerou código.",
            code: "no_files",
          },
          200,
        );
      }

      const devPort = devPortFromMeta ?? (Number.parseInt(detectDevPort(projectFiles), 10) || 5173);

      try {
        const { sandbox, sandboxId } = await connectSandboxForPreview(
          supabase,
          projectId,
          E2B_API_KEY,
        );
        await syncProjectFilesToSandbox(sandbox, projectFiles);

        let url = previewUrlFromSandbox(sandbox, devPort);
        const probeStatus = await probePreviewUrlStatus(url, 3);
        let ready = probeStatus === "live";
        let rebootLogs: string | undefined;
        let activeSandboxId = sandboxId;

        if (!ready) {
          const reboot = await rebootPreviewDevServer(
            supabase,
            projectId,
            E2B_API_KEY,
            projectFiles,
            devPort,
            url,
          );
          ready = reboot.ready;
          url = reboot.url;
          activeSandboxId = reboot.sandboxId;
          rebootLogs = reboot.logs;
        }

        const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
        const nextMeta = {
          ...existing,
          previewUrl: url,
          previewExpiresAt: expiresAt,
          previewSandboxId: activeSandboxId,
          previewPort: devPort,
          previewReady: ready,
        };
        await supabase.from("projects").update({ meta: nextMeta }).eq("id", projectId);

        let published = false;
        let publishedUrl: string | null = null;
        if (ready) {
          const pub = await autoPublishIfNeeded(supabase, projectId, userData.user.id, nextMeta);
          published = pub.published;
          publishedUrl = pub.url ?? null;
        }

        return json({
          url,
          expiresAt,
          ready,
          reused: true,
          synced: true,
          published,
          publishedUrl,
          logs: rebootLogs,
        });
      } catch (syncErr: unknown) {
        const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
        if (!msg.includes("Ainda não há") && !msg.includes("ambiente ao vivo")) {
          throw syncErr;
        }
        syncOnlyMissedSandbox = true;
      }
    }

    const effectiveForce = force || syncOnlyMissedSandbox;
    if (syncOnlyMissedSandbox) {
      cached = null;
    }

    if (probeOnly && cached) {
      const projectFiles = await loadProjectFiles(supabase, projectId);
      if (projectFiles.length === 0) {
        await supabase
          .from("projects")
          .update({ meta: clearedPreviewMeta(existing) })
          .eq("id", projectId);
        return json(
          {
            url: null,
            ready: false,
            reused: false,
            probeOnly: true,
            error: "Projeto sem arquivos — o agente ainda não gerou código.",
            code: "no_files",
          },
          200,
        );
      }

      const probeStatus = await probePreviewUrlStatus(cached.url, 3);
      if (probeStatus === "stale") {
        // Não limpa meta aqui — evita flash de devUrl no cliente; force boot atualiza atomically.
        return json(
          {
            url: cached.url,
            ready: false,
            reused: true,
            stale: true,
            probeOnly: true,
            code: "e2b_sandbox_stale",
          },
          200,
        );
      }

      let activeUrl = cached.url;
      let ready = probeStatus === "live";
      let rebootLogs: string | undefined;
      let sandboxId =
        typeof existing.previewSandboxId === "string" ? existing.previewSandboxId : undefined;

      if (!ready) {
        const devPort =
          devPortFromMeta ?? (Number.parseInt(detectDevPort(projectFiles), 10) || 5173);
        const reboot = await rebootPreviewDevServer(
          supabase,
          projectId,
          E2B_API_KEY,
          projectFiles,
          devPort,
          cached.url,
        );
        ready = reboot.ready;
        activeUrl = reboot.url;
        sandboxId = reboot.sandboxId;
        rebootLogs = reboot.logs;
      }

      let published = false;
      let publishedUrl: string | null = null;
      const nextMeta = {
        ...existing,
        previewReady: ready,
        previewUrl: activeUrl,
        ...(sandboxId ? { previewSandboxId: sandboxId } : {}),
      };
      await supabase.from("projects").update({ meta: nextMeta }).eq("id", projectId);

      if (ready) {
        const pub = await autoPublishIfNeeded(supabase, projectId, userData.user.id, nextMeta);
        published = pub.published;
        publishedUrl = pub.url ?? null;
      }
      return json({
        url: activeUrl,
        expiresAt: cached.expiresAt,
        reused: true,
        ready,
        probeOnly: true,
        published,
        publishedUrl,
        logs: rebootLogs,
      });
    }

    if (cached && !effectiveForce) {
      const projectFiles = await loadProjectFiles(supabase, projectId);
      if (projectFiles.length === 0) {
        await supabase
          .from("projects")
          .update({ meta: clearedPreviewMeta(existing) })
          .eq("id", projectId);
        return json(
          {
            url: null,
            ready: false,
            reused: false,
            error: "Projeto sem arquivos — o agente ainda não gerou código.",
            code: "no_files",
          },
          200,
        );
      }

      const probeStatus = await probePreviewUrlStatus(cached.url, 2);
      if (probeStatus === "stale") {
        await supabase
          .from("projects")
          .update({ meta: clearedPreviewMeta(existing) })
          .eq("id", projectId);
      } else {
        let activeUrl = cached.url;
        let ready = probeStatus === "live";
        if (!ready && existing.previewReady === true) {
          const devPort =
            devPortFromMeta ?? (Number.parseInt(detectDevPort(projectFiles), 10) || 5173);
          const reboot = await rebootPreviewDevServer(
            supabase,
            projectId,
            E2B_API_KEY,
            projectFiles,
            devPort,
            cached.url,
          );
          ready = reboot.ready;
          activeUrl = reboot.url;
          await supabase
            .from("projects")
            .update({
              meta: {
                ...existing,
                previewReady: ready,
                previewUrl: activeUrl,
                previewSandboxId: reboot.sandboxId,
              },
            })
            .eq("id", projectId);
        }
        let published = false;
        let publishedUrl: string | null =
          typeof existing.publishedUrl === "string" ? existing.publishedUrl : null;
        if (ready) {
          const pub = await autoPublishIfNeeded(supabase, projectId, userData.user.id, {
            ...existing,
            previewUrl: activeUrl,
            previewReady: true,
          });
          published = pub.published;
          if (pub.url) publishedUrl = pub.url;
        }
        return json({
          url: activeUrl,
          expiresAt: cached.expiresAt,
          reused: true,
          ready,
          published,
          publishedUrl,
        });
      }
    }

    const files = await loadProjectFiles(supabase, projectId);

    if (files.length === 0) {
      if (existing.previewUrl || existing.previewSandboxId) {
        await supabase
          .from("projects")
          .update({ meta: clearedPreviewMeta(existing) })
          .eq("id", projectId);
      }
      // P3 fix: boot de auto-run com force=true E sem files não pode
      // criar sandbox. Se userInitiated=false E cached já foi invalidado
      // (force=true), é um boot especulativo do useEditorAgentOrchestration.
      // Retornar no_files silenciosamente (sem alocar).
      const logLevel = userInitiated === false ? "info" : "warn";
      console[logLevel]("[preview-boot] no_files + !userInitiated", {
        projectId,
        userInitiated,
        force,
      });
      return json(
        {
          url: null,
          ready: false,
          reused: false,
          error: "Projeto sem arquivos — o agente ainda não gerou código.",
          code: "no_files",
        },
        200,
      );
    }

    const devPort = Number.parseInt(detectDevPort(files ?? []), 10) || 5173;

    const sandboxResult = await connectSandboxForPreview(supabase, projectId, E2B_API_KEY);
    const { sandbox, sandboxId, reused } = sandboxResult;

    await syncProjectFilesToSandbox(sandbox, files ?? []);

    const { installOk } = await bootDevServerInSandbox(sandbox, files ?? [], devPort);

    const url = previewUrlFromSandbox(sandbox, devPort);
    const ready = await probePreviewUrl(url, PROBE_ATTEMPTS_AFTER_BOOT);
    const logs = ready ? undefined : await readDevLogTail(sandbox);

    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();

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
    const code =
      (e as any)?.code ||
      (msg.includes("circuit") || msg.includes("cooling") || msg.includes("E2B creation")
        ? "e2b_creation_circuit"
        : undefined);
    console.error("[preview-boot]", msg);
    return json({ error: msg, code }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
