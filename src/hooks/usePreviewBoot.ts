import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { formatE2bUserError } from "@/lib/e2b-status";

type BootResult = {
  url?: string;
  expiresAt?: string;
  reused?: boolean;
  ready?: boolean;
  probeOnly?: boolean;
  published?: boolean;
  publishedUrl?: string | null;
  logs?: string;
  error?: string;
  code?: string;
};

type BootOpts = {
  force?: boolean;
  probeOnly?: boolean;
  silent?: boolean;
};

const RETRY_DELAYS_MS = [0, 5_000, 15_000, 30_000];

export function usePreviewBoot(projectId: string) {
  const [booting, setBooting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [warming, setWarming] = useState(false);
  const bootAttemptsRef = useRef(0);
  const qc = useQueryClient();

  const callPreviewBoot = useCallback(
    async (opts?: BootOpts): Promise<BootResult | null> => {
      const { url, publishableKey } = getSupabaseEnv();
      if (!url || !publishableKey) {
        const msg = "Preview indisponível neste ambiente.";
        setLastError(msg);
        if (!opts?.silent) toast.error(msg);
        return null;
      }

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        const msg = "Faça login para ver o preview.";
        setLastError(msg);
        if (!opts?.silent) toast.error(msg);
        return null;
      }

      const res = await fetch(`${url}/functions/v1/preview-boot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: publishableKey,
        },
        body: JSON.stringify({
          projectId,
          force: opts?.force ?? false,
          probeOnly: opts?.probeOnly ?? false,
        }),
      });

      const body = (await res.json()) as BootResult;
      if (!res.ok) {
        const raw = body.error ?? `preview-boot HTTP ${res.status}`;
        const err = new Error(formatE2bUserError(raw, body.code)) as Error & { code?: string };
        err.code = body.code;
        throw err;
      }
      return body;
    },
    [projectId],
  );

  const boot = useCallback(
    async (opts?: BootOpts) => {
      if (opts?.probeOnly) {
        try {
          const body = await callPreviewBoot({ ...opts, silent: true });
          if (body?.ready) {
            setWarming(false);
            await qc.invalidateQueries({ queryKey: ["project", projectId] });
            if (body.published && body.publishedUrl) {
              toast.success("Site no ar", { description: body.publishedUrl, duration: 5000 });
            }
          }
          return body?.url ?? null;
        } catch {
          return null;
        }
      }

      setBooting(true);
      setLastError(null);
      if (!opts?.silent) setWarming(false);
      logEditorTelemetryEvent("preview", "boot_start", "info", projectId);
      try {
        const body = await callPreviewBoot(opts);
        if (!body) return null;

        await qc.invalidateQueries({ queryKey: ["project", projectId] });
        if (body.url) {
          if (body.ready === false) setWarming(true);
          if (body.published && body.publishedUrl) {
            toast.success("Site no ar", { description: body.publishedUrl, duration: 5000 });
          } else if (!body.reused && !opts?.silent) {
            toast.success("Preview conectado");
          }
          logEditorTelemetryEvent(
            "preview",
            "boot_ok",
            "ok",
            `${body.reused ? "reused" : "new"} ready=${body.ready ?? "?"} ${body.url.slice(0, 60)}`,
          );
        }
        bootAttemptsRef.current = 0;
        return body.url ?? null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Não foi possível abrir o preview";
        setLastError(msg);
        logEditorTelemetryEvent("preview", "boot_fail", "error", msg.slice(0, 240));
        if (!opts?.silent && !msg.includes("agente")) {
          toast.error(msg.length > 140 ? `${msg.slice(0, 140)}…` : msg);
        }
        return null;
      } finally {
        setBooting(false);
      }
    },
    [callPreviewBoot, projectId, qc],
  );

  const bootWithRetry = useCallback(
    async (opts?: BootOpts) => {
      const maxAttempts = RETRY_DELAYS_MS.length;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        }
        bootAttemptsRef.current = attempt + 1;
        const url = await boot({ ...opts, silent: attempt > 0 });
        if (url) return url;
      }
      return null;
    },
    [boot],
  );

  useEffect(() => {
    if (!warming) return;
    const interval = window.setInterval(() => {
      void boot({ probeOnly: true, silent: true });
    }, 5_000);
    const timeout = window.setTimeout(() => setWarming(false), 90_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [warming, boot]);

  return {
    booting,
    boot,
    bootWithRetry,
    lastError,
    warming,
    clearWarming: () => setWarming(false),
    clearError: () => setLastError(null),
  };
}
