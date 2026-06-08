import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { formatE2bUserError } from "@/lib/e2b-status";
import { isNoFilesPreviewError } from "@/lib/preview-boot-guards";
import { isStaleE2bPreviewError } from "@/lib/e2b-preview-stale";

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
  stale?: boolean;
};

type BootOpts = {
  force?: boolean;
  probeOnly?: boolean;
  /** Sincroniza ficheiros no sandbox sem reiniciar Vite (quando já há previewUrl). */
  syncOnly?: boolean;
  silent?: boolean;
};



const RETRY_DELAYS_MS = [0, 5_000, 15_000, 30_000];
const PROBE_FAIL_BEFORE_FORCE = 4;
const E2B_CIRCUIT_BACKOFF_MS = 120_000; // long backoff when server reports creation circuit (stops infinite creation spam)

type UsePreviewBootOpts = {
  /** Preview em repouso — não faz polling probeOnly. */
  idle?: boolean;
  /** Aba preview aberta com URL — verifica saúde da porta e reboota Vite se morreu. */
  watchHealth?: boolean;
  /** Arquivos no projeto — limpa bloqueio no_files quando o agente já gerou código. */
  fileCount?: number;
};

const HEALTH_PROBE_MS = 45_000;

export function usePreviewBoot(projectId: string, opts?: UsePreviewBootOpts) {
  const idle = opts?.idle ?? false;
  const watchHealth = opts?.watchHealth ?? false;
  const fileCount = opts?.fileCount ?? 0;
  const [booting, setBooting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [warming, setWarming] = useState(false);
  const [bootLogs, setBootLogs] = useState<string | null>(null);
  const [sandboxStale, setSandboxStale] = useState(false);
  const staleRebootRef = useRef(false);
  const bootAttemptsRef = useRef(0);
  const probeFailuresRef = useRef(0);
  const bootInFlightRef = useRef(false);
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
          syncOnly: opts?.syncOnly ?? false,
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
        if (idle) return null;
        if (fileCount === 0 && isNoFilesPreviewError(lastError)) return null;
        try {
          const body = await callPreviewBoot({ ...opts, silent: true });
          if (body?.stale || body?.code === "e2b_sandbox_stale") {
            setSandboxStale(true);
            await qc.invalidateQueries({ queryKey: ["project", projectId] });
            if (!staleRebootRef.current && fileCount > 0) {
              staleRebootRef.current = true;
              logEditorTelemetryEvent("preview", "stale_reboot", "info", projectId);
              void boot({ force: true, silent: true }).finally(() => {
                staleRebootRef.current = false;
              });
            }
            return null;
          }
          if (body?.ready) {
            probeFailuresRef.current = 0;
            setSandboxStale(false);
            setWarming(false);
            await qc.invalidateQueries({ queryKey: ["project", projectId] });
          } else if (body?.url) {
            probeFailuresRef.current += 1;
            if (probeFailuresRef.current >= PROBE_FAIL_BEFORE_FORCE) {
              probeFailuresRef.current = 0;
              logEditorTelemetryEvent("preview", "probe_reboot", "info", projectId);
              void boot({ force: true, silent: true });
            }
          }
          return body?.url ?? null;
        } catch {
          return null;
        }
      }

      if (bootInFlightRef.current) return null;
      if (fileCount === 0 && isNoFilesPreviewError(lastError) && !opts?.force && !opts?.syncOnly) {
        return null;
      }
      bootInFlightRef.current = true;
      setBooting(true);
      setLastError(null);
      setSandboxStale(false);
      if (!opts?.silent) setWarming(false);
      logEditorTelemetryEvent("preview", "boot_start", "info", projectId);
      try {
        const body = await callPreviewBoot(opts);
        if (!body) return null;

        await qc.invalidateQueries({ queryKey: ["project", projectId] });
        if (body.logs) setBootLogs(body.logs);
        if (body.url) {
          if (body.ready === false) {
            setWarming(true);
            if (body.logs && !opts?.silent) {
              setLastError(`Vite ainda subindo. Logs: ${body.logs.slice(0, 400)}`);
            }
          } else {
            setBootLogs(null);

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
        const code = (e as any)?.code;
        const isCircuit = code === "e2b_creation_circuit" || /circuit|cooling|e2b_creation_circuit/i.test(msg);
        const isNoFiles = code === "no_files" || /sem arquivos|ainda não gerou|sem projeto/i.test(msg);
        const isStale = isStaleE2bPreviewError(msg, code);
        if (isStale) setSandboxStale(true);
        setLastError(
          isCircuit
            ? `E2B creation blocked (circuit open). ${msg}`
            : formatE2bUserError(msg, code),
        );
        logEditorTelemetryEvent("preview", "boot_fail", "error", (isCircuit ? "circuit:" : isNoFiles ? "nofiles:" : "") + msg.slice(0, 240));
        // No files: silently show empty guide, never spam toasts or retry loops
        if (!opts?.silent && !isNoFiles && !isStale && !msg.includes("agente") && !isCircuit) {
          toast.error(msg.length > 140 ? `${msg.slice(0, 140)}…` : msg);
        }
        if (isNoFiles) {
          setBooting(false);
          setWarming(false);
        }
        return null;
      } finally {
        bootInFlightRef.current = false;
        setBooting(false);
      }
    },
    [callPreviewBoot, projectId, qc, idle, fileCount],
  );

  useEffect(() => {
    if (fileCount > 0 && isNoFilesPreviewError(lastError)) {
      setLastError(null);
    }
  }, [fileCount, lastError]);

  const bootWithRetry = useCallback(
    async (opts?: BootOpts) => {
      // If last known error was circuit, do not hammer — force user to explicit retry after fixing key or waiting
      if (lastError && /circuit|cooling|e2b_creation_circuit/i.test(lastError) && !opts?.force) {
        return null;
      }
      const maxAttempts = RETRY_DELAYS_MS.length;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          // extra backoff on repeated failures; circuit path already short-circuits above
          const delay = RETRY_DELAYS_MS[attempt] + (lastError && /circuit/i.test(lastError) ? E2B_CIRCUIT_BACKOFF_MS : 0);
          await new Promise((r) => setTimeout(r, delay));
        }
        bootAttemptsRef.current = attempt + 1;
        const url = await boot({ ...opts, silent: opts?.silent ?? true });
        if (url) return url;
      }
      return null;
    },
    [boot, lastError],
  );

  useEffect(() => {
    bootInFlightRef.current = false;
    setSandboxStale(false);
    staleRebootRef.current = false;
  }, [projectId]);

  useEffect(() => {
    if (!warming || idle) {
      if (idle) setWarming(false);
      return;
    }
    // Skip auto probes while in circuit (prevents infinite creation attempts on bad/transient E2B)
    if (lastError && /circuit|cooling|e2b_creation_circuit/i.test(lastError)) {
      return;
    }
    const interval = window.setInterval(() => {
      void boot({ probeOnly: true, silent: true });
    }, 5_000);
    const timeout = window.setTimeout(() => setWarming(false), 90_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [warming, boot, idle, lastError]);

  useEffect(() => {
    if (!watchHealth || idle) return;
    if (lastError && /circuit|cooling|e2b_creation_circuit/i.test(lastError)) {
      return; // health probes also respect circuit
    }
    const interval = window.setInterval(() => {
      void boot({ probeOnly: true, silent: true });
    }, HEALTH_PROBE_MS);
    return () => window.clearInterval(interval);
  }, [watchHealth, idle, boot, lastError]);

  const isE2bCircuit = !!(lastError && /circuit|cooling|e2b_creation_circuit/i.test(lastError));

  const isNoFiles = fileCount === 0 && isNoFilesPreviewError(lastError);

  return {
    booting,
    boot,
    bootWithRetry,
    lastError,
    bootLogs,
    warming,
    isE2bCircuit,
    isNoFiles,
    sandboxStale,
    clearWarming: () => setWarming(false),
    clearError: () => setLastError(null),
    clearSandboxStale: () => setSandboxStale(false),
  };
}
