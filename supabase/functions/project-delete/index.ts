// project-delete — encerra sandbox E2B do projeto e remove o registro (CASCADE nos filhos)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadUserE2bApiKey } from "../_shared/user-e2b.ts";
import { snapshotProjectFilesToCorpus } from "../_shared/code-corpus.ts";
import {
  killAllProjectSandboxes,
  purgeForgeOrphanSandboxes,
  readSandboxMeta,
} from "../_shared/project-sandbox.ts";
import { forgeOrigin } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
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
      .select("id, owner_id, meta, template")
      .eq("id", projectId)
      .single();

    if (!project || project.owner_id !== userData.user.id) {
      return json({ error: "Projeto não encontrado" }, 404);
    }

    const sm = readSandboxMeta((project.meta ?? {}) as Record<string, unknown>);
    const e2bKey = await loadUserE2bApiKey(supabase, userData.user.id);

    let sandboxCleanup: { killed: string[]; failed: string[]; listed: string[] } | null = null;
    let orphanCleanup: {
      orphans: Array<{ sandboxID: string; projectId: string | null }>;
      killed: string[];
      failed: string[];
    } | null = null;
    if (e2bKey) {
      sandboxCleanup = await killAllProjectSandboxes(e2bKey, projectId, sm.previewSandboxId);
      if (sandboxCleanup.failed.length > 0) {
        console.error(
          `[project-delete] sandbox kill incomplete project=${projectId}`,
          sandboxCleanup,
        );
      }
    } else if (sm.previewSandboxId) {
      console.warn(
        `[project-delete] previewSandboxId=${sm.previewSandboxId} but no E2B key — sandbox may remain`,
      );
    }

    const corpusSnapshot = await snapshotProjectFilesToCorpus(
      supabase as unknown as Parameters<typeof snapshotProjectFilesToCorpus>[0],
      {
        projectId,
        userId: userData.user.id,
        projectTemplate: (project as { template?: string }).template ?? "vite-react",
      },
    );
    if (corpusSnapshot.error) {
      console.warn(
        `[project-delete] code_corpus snapshot partial/failed project=${projectId}`,
        corpusSnapshot.error,
      );
    }

    await supabase.from("agent_checkpoints").delete().eq("project_id", projectId);
    await supabase.from("agent_pending_messages").delete().eq("project_id", projectId);

    const { error: delErr } = await supabase.from("projects").delete().eq("id", projectId);
    if (delErr) return json({ error: delErr.message }, 500);

    if (e2bKey) {
      orphanCleanup = await purgeForgeOrphanSandboxes(e2bKey, supabase, { projectId });
      if (orphanCleanup.failed.length > 0) {
        console.error(
          `[project-delete] orphan sandbox purge incomplete project=${projectId}`,
          orphanCleanup,
        );
      }
    }

    return json({
      ok: true,
      corpusCaptured: corpusSnapshot.captured,
      sandboxCleanup: sandboxCleanup ?? { killed: [], failed: [], listed: [] },
      orphanCleanup: orphanCleanup ?? { orphans: [], killed: [], failed: [] },
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
