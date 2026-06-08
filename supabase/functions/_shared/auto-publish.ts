import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { executeDeployPublish } from "./deploy-publish-core.ts";
import { isProjectPublishReadyFromFiles } from "./publish-ready.ts";

/** Publica automaticamente quando há previewUrl novo e ainda não foi registrado como publishedUrl. */
export async function autoPublishIfNeeded(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  meta: Record<string, unknown>,
): Promise<{ published: boolean; url?: string | null; error?: string }> {
  const previewUrl = typeof meta.previewUrl === "string" ? meta.previewUrl.trim() : "";
  const publishedUrl = typeof meta.publishedUrl === "string" ? meta.publishedUrl.trim() : "";
  if (!previewUrl || publishedUrl === previewUrl) {
    return { published: false };
  }

  const { data: projectFiles } = await supabase
    .from("project_files")
    .select("path, content")
    .eq("project_id", projectId);
  if (!isProjectPublishReadyFromFiles((projectFiles ?? []) as Array<{ path: string; content: string }>)) {
    return { published: false, error: "Entry ainda no placeholder do seed" };
  }

  const result = await executeDeployPublish(supabase, projectId, userId);
  if (!result.ok) return { published: false, error: result.error };
  if (result.needsPreview) return { published: false, error: "Preview ainda não pronto" };

  return { published: true, url: result.url ?? previewUrl };
}