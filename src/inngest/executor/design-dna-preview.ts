/**
 * Design DNA DEEP preview — Gate G4 (Etapa 4)
 *
 * previewUrl = live view (noVNC) na porta PREVIEW_PORT — NÃO a porta CDP.
 * CDP permanece em CDP_PORT para o agent loop.
 */
import { appendJobEvent } from "../functions/_shared-design-dna";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runInSandbox } from "./e2b-client";

export const CDP_PORT = 9222;
export const PREVIEW_PORT = 6080;

const E2B_DOMAIN =
  (typeof process !== "undefined" ? process.env.E2B_DOMAIN : undefined) ||
  "e2b.app";

export function buildLivePreviewUrl(
  sandboxId: string,
  domain: string = E2B_DOMAIN,
): string {
  return `https://${PREVIEW_PORT}-${sandboxId}.${domain}`;
}

export function buildCdpHost(sandboxId: string, domain: string = E2B_DOMAIN): string {
  return `${CDP_PORT}-${sandboxId}.${domain}`;
}

export type EnsurePreviewResult = {
  previewUrl: string;
  cdpReady: boolean;
  liveViewReady: boolean;
};

async function probeLivePreview(
  previewUrl: string,
  accessToken: string | null,
  timeoutMs: number,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers["X-Access-Token"] = accessToken;
      const resp = await fetch(previewUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(8_000),
      });
      if (resp.ok) {
        const text = await resp.text();
        if (text.length > 100) return true;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return false;
}

/**
 * Valida CDP + live view e retorna previewUrl canônico (porta 6080).
 * Grava meta.previewUrl antes do agent loop.
 */
export async function ensurePreview(
  supabase: SupabaseClient,
  jobId: string,
  sandboxId: string,
  accessToken: string | null,
): Promise<EnsurePreviewResult> {
  const previewUrl = buildLivePreviewUrl(sandboxId);

  const cdpCheck = `curl -sf http://127.0.0.1:${CDP_PORT}/json/version >/dev/null && echo CDP_READY || echo CDP_NOT_READY`;
  const cdpResult = await runInSandbox(sandboxId, accessToken, cdpCheck, { timeoutMs: 15_000 });
  const cdpReady = cdpResult.stdout?.includes("CDP_READY") ?? false;

  if (!cdpReady) {
    await appendJobEvent(supabase, jobId, "preview_error", {
      code: "cdp_not_ready",
      port: CDP_PORT,
      message: "Chrome CDP não responde na porta 9222 — verifique o template E2B.",
    });
    throw new Error(
      `Chrome CDP not responding on port ${CDP_PORT} — template start-browser-stack.sh may have failed.`,
    );
  }

  await appendJobEvent(supabase, jobId, "chrome_cdp_ready", { port: CDP_PORT });

  const liveCheck = `curl -sf -o /dev/null -w "%{http_code}" http://127.0.0.1:${PREVIEW_PORT}/ 2>/dev/null || echo 000`;
  let liveViewReady = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    const liveResult = await runInSandbox(sandboxId, accessToken, liveCheck, { timeoutMs: 10_000 });
    const code = String(liveResult.stdout ?? "").trim();
    if (code === "200" || code === "301" || code === "302") {
      liveViewReady = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  if (!liveViewReady) {
    liveViewReady = await probeLivePreview(previewUrl, accessToken, 30_000);
  }

  if (!liveViewReady) {
    await appendJobEvent(supabase, jobId, "preview_error", {
      code: "live_view_not_ready",
      port: PREVIEW_PORT,
      previewUrl,
      message:
        `Live view não disponível em :${PREVIEW_PORT}. Rebuild o template E2B (dreaming-doing-chromium).`,
    });
    throw new Error(
      `Live preview not ready on port ${PREVIEW_PORT} — rebuild E2B template with noVNC stack.`,
    );
  }

  await appendJobEvent(supabase, jobId, "sandbox_ready", {
    sandboxId,
    previewUrl,
    cdpPort: CDP_PORT,
    liveViewPort: PREVIEW_PORT,
  });

  return { previewUrl, cdpReady, liveViewReady };
}