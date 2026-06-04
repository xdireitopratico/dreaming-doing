import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const publishProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, owner_id, name, meta")
      .eq("id", data.projectId)
      .single();

    if (pErr || !project || project.owner_id !== userId) {
      throw new Error("Projeto não encontrado");
    }

    const meta = (project.meta ?? {}) as Record<string, unknown>;
    const previewUrl =
      typeof meta.previewUrl === "string" ? meta.previewUrl.trim() : "";

    const { data: deployment, error: dErr } = await supabase
      .from("deployments")
      .insert({
        project_id: data.projectId,
        provider: "vercel",
        status: previewUrl ? "ready" : "error",
        url: previewUrl || null,
        logs: previewUrl
          ? "Publicado via preview ao vivo (E2B)."
          : "Inicie o preview ao vivo antes de publicar, ou configure deploy Vercel.",
      })
      .select("id, url, status")
      .single();

    if (dErr) throw new Error(dErr.message);

    if (previewUrl) {
      await supabase
        .from("projects")
        .update({
          meta: {
            ...meta,
            publishedUrl: previewUrl,
            publishedAt: new Date().toISOString(),
            lastDeploymentId: deployment.id,
          },
        })
        .eq("id", data.projectId);
    }

    return {
      deploymentId: deployment.id as string,
      url: deployment.url as string | null,
      status: deployment.status as string,
      needsPreview: !previewUrl,
    };
  });