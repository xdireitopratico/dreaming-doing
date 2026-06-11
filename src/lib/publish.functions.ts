import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type DeployPublishResponse = {
  deploymentId?: string;
  url?: string | null;
  status?: string;
  provider?: string;
  needsPreview?: boolean;
  error?: string;
};

export const publishProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, owner_id")
      .eq("id", data.projectId)
      .single();

    if (pErr || !project || project.owner_id !== userId) {
      throw new Error("Projeto não encontrado");
    }

    const { data: result, error } = await supabase.functions.invoke("deploy-publish", {
      body: { projectId: data.projectId },
    });

    if (error) throw new Error(error.message);

    const body = (result ?? {}) as DeployPublishResponse;
    if (body.error) throw new Error(body.error);

    return {
      deploymentId: body.deploymentId as string,
      url: body.url ?? null,
      status: (body.status ?? "error") as string,
      provider: body.provider,
      needsPreview: Boolean(body.needsPreview),
    };
  });
