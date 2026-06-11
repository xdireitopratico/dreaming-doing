import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";

type PublishFn = (opts: { data: { projectId: string } }) => Promise<{
  url?: string | null;
  needsPreview?: boolean;
}>;

const PUBLISH_TIMEOUT_MS = 30_000;

type AutoPublishOpts = {
  projectId: string;
  devUrl: string | null;
  publishedUrl: string | null;
  previewReady: boolean;
  /** Entry do app saiu do placeholder do seed (web/expo). */
  contentPublishReady: boolean;
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
  contentPublishReady,
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PUBLISH_TIMEOUT_MS);

    try {
      // publishFn é server fn do TanStack — não suporta signal nativamente.
      // Envolvemos em Promise.race com timeout manual.
      const res = await Promise.race([
        publishFn({ data: { projectId } }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error("Publish timeout (30s)"));
          });
        }),
      ]);
      if (res.needsPreview) return null;
      if (res.url) {
        await qc.invalidateQueries({ queryKey: ["project", projectId] });
        logEditorTelemetryEvent("preview", "auto_publish_ok", "ok", res.url.slice(0, 120));
        return res.url;
      }
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao publicar";
      logEditorTelemetryEvent("preview", "auto_publish_fail", "error", msg.slice(0, 200));
      return null;
    } finally {
      clearTimeout(timeoutId);
      setPublishing(false);
    }
  }, [devUrl, publishedUrl, projectId, publishFn, qc]);

  useEffect(() => {
    if (!enabled || !devUrl || !previewReady || !contentPublishReady) return;
    if (booting || warming || publishing) return;
    if (publishedUrl === devUrl) return;
    void publishNow();
    // publishing é guard de concorrência, não trigger — removido intencionalmente das deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    devUrl,
    previewReady,
    contentPublishReady,
    booting,
    warming,
    publishedUrl,
    publishNow,
  ]);

  return { publishing, publishNow, isLive: Boolean(devUrl && publishedUrl === devUrl) };
}
