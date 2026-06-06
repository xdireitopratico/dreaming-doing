import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";

type PublishFn = (opts: { data: { projectId: string } }) => Promise<{
  url?: string | null;
  needsPreview?: boolean;
}>;

type AutoPublishOpts = {
  projectId: string;
  devUrl: string | null;
  publishedUrl: string | null;
  previewReady: boolean;
  enabled: boolean;
  booting: boolean;
  warming: boolean;
  publishFn: PublishFn;
};

/** Publica em background quando o preview E2B fica pronto (fallback do servidor). */
export function useAutoPublish({
  projectId,
  devUrl,
  publishedUrl,
  previewReady,
  enabled,
  booting,
  warming,
  publishFn,
}: AutoPublishOpts) {
  const [publishing, setPublishing] = useState(false);
  const attemptedRef = useRef<string | null>(null);
  const qc = useQueryClient();

  const publishNow = useCallback(async (): Promise<string | null> => {
    if (!devUrl || publishedUrl === devUrl) return publishedUrl ?? devUrl;
    if (attemptedRef.current === devUrl) return null;

    setPublishing(true);
    attemptedRef.current = devUrl;
    logEditorTelemetryEvent("preview", "auto_publish_start", "info", projectId);

    try {
      const res = await publishFn({ data: { projectId } });
      if (res.needsPreview) return null;
      if (res.url) {
        await qc.invalidateQueries({ queryKey: ["project", projectId] });
        logEditorTelemetryEvent("preview", "auto_publish_ok", "ok", res.url.slice(0, 120));
        toast.success("Site no ar", { description: res.url, duration: 5000 });
        return res.url;
      }
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao publicar";
      logEditorTelemetryEvent("preview", "auto_publish_fail", "error", msg.slice(0, 200));
      attemptedRef.current = null;
      return null;
    } finally {
      setPublishing(false);
    }
  }, [devUrl, publishedUrl, projectId, publishFn, qc]);

  useEffect(() => {
    if (!enabled || !devUrl || !previewReady) return;
    if (booting || warming || publishing) return;
    if (publishedUrl === devUrl) return;
    void publishNow();
  }, [
    enabled,
    devUrl,
    previewReady,
    booting,
    warming,
    publishing,
    publishedUrl,
    publishNow,
  ]);

  return { publishing, publishNow, isLive: Boolean(devUrl && publishedUrl === devUrl) };
}