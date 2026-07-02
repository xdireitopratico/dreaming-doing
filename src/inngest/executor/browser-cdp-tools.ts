/**
 * browser-cdp-tools — DEEP browser actions via Playwright inside E2B (localhost CDP).
 *
 * VM worker orchestrates; commands execute in sandbox (127.0.0.1:9222).
 * External wss://9222-*.e2b.app is not used in production DEEP.
 */

import { errorMessage } from "@/lib/error-utils";
import { runSandboxCdpAction } from "./sandbox-browser-driver";
import { PREVIEW_PORT } from "./design-dna-preview";
import type { CapturePageSegmentsResult } from "./deep-capture/page-segments";

const E2B_DOMAIN =
  (typeof process !== "undefined" ? process.env.E2B_DOMAIN : undefined) ||
  "e2b.app";
const NAVIGATE_TIMEOUT_MS = 60_000;

/** Viewport capture only. fullPage=true must use capturePageSegments (G-CAP-4). */
export async function takeScreenshot(
  sandboxId: string,
  accessToken: string | null,
  fullPage = false,
): Promise<{ base64: string; error?: string }> {
  if (fullPage) {
    return {
      base64: "",
      error: "fullPage screenshot redirects to capturePageSegments — never single PNG blob",
    };
  }
  const res = await runSandboxCdpAction<{ base64?: string }>(
    sandboxId,
    accessToken,
    { action: "screenshot" },
    { timeoutMs: 90_000 },
  );
  if (!res.ok) return { base64: "", error: res.error };
  return {
    base64: res.data.base64 ?? "",
    error: res.data.base64 ? undefined : "Screenshot data missing",
  };
}

/** Scroll-height segments (Refero-style) — one viewport PNG per fold. */
export async function capturePageSegments(
  sandboxId: string,
  accessToken: string | null,
  opts?: { maxSegments?: number },
): Promise<CapturePageSegmentsResult> {
  const res = await runSandboxCdpAction<CapturePageSegmentsResult>(
    sandboxId,
    accessToken,
    {
      action: "capture_page_segments",
      maxSegments: opts?.maxSegments ?? 50,
    },
    { timeoutMs: 180_000 },
  );
  if (!res.ok) {
    return {
      segments: [],
      scrollHeight: 0,
      viewportHeight: 0,
      segmentCount: 0,
      error: res.error,
    };
  }
  const data = res.data;
  return {
    segments: data.segments ?? [],
    scrollHeight: data.scrollHeight ?? 0,
    viewportHeight: data.viewportHeight ?? 0,
    segmentCount: data.segmentCount ?? data.segments?.length ?? 0,
  };
}

export async function navigateTo(
  sandboxId: string,
  accessToken: string | null,
  url: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await runSandboxCdpAction<{ success?: boolean; url?: string }>(
    sandboxId,
    accessToken,
    { action: "navigate", url, timeoutMs: NAVIGATE_TIMEOUT_MS },
    { timeoutMs: NAVIGATE_TIMEOUT_MS + 15_000 },
  );
  if (!res.ok) return { success: false, error: res.error };
  return { success: true };
}

export async function scrollPage(
  sandboxId: string,
  accessToken: string | null,
  y: number,
): Promise<{ success: boolean; error?: string }> {
  const res = await runSandboxCdpAction<{ success?: boolean }>(
    sandboxId,
    accessToken,
    { action: "scroll", y },
  );
  if (!res.ok) return { success: false, error: res.error };
  return { success: true };
}

export async function analyzeElement(
  sandboxId: string,
  accessToken: string | null,
  selector: string,
): Promise<{
  tagName?: string;
  text?: string;
  html?: string;
  rect?: Record<string, unknown>;
  styles?: Record<string, string>;
  error?: string;
}> {
  const res = await runSandboxCdpAction<{
    tagName?: string;
    text?: string;
    html?: string;
    rect?: Record<string, unknown>;
    styles?: Record<string, string>;
    error?: string;
  }>(sandboxId, accessToken, { action: "analyze", selector });
  if (!res.ok) return { error: res.error };
  if (res.data.error) return { error: res.data.error };
  return res.data;
}

export async function getUrl(
  sandboxId: string,
  accessToken: string | null,
): Promise<{ url: string; error?: string }> {
  const res = await runSandboxCdpAction<{ url?: string }>(
    sandboxId,
    accessToken,
    { action: "get_url" },
  );
  if (!res.ok) return { url: "", error: res.error };
  return { url: String(res.data.url ?? ""), error: undefined };
}

export async function clickElement(
  sandboxId: string,
  accessToken: string | null,
  selector: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await runSandboxCdpAction<{ success?: boolean }>(
    sandboxId,
    accessToken,
    { action: "click", selector },
  );
  if (!res.ok) return { success: false, error: res.error };
  return { success: true };
}

export async function typeText(
  sandboxId: string,
  accessToken: string | null,
  selector: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await runSandboxCdpAction<{ success?: boolean }>(
    sandboxId,
    accessToken,
    { action: "type", selector, text },
  );
  if (!res.ok) return { success: false, error: res.error };
  return { success: true };
}

export async function evaluateJs(
  sandboxId: string,
  accessToken: string | null,
  expression: string,
): Promise<{ result?: unknown; error?: string }> {
  const res = await runSandboxCdpAction<{ result?: unknown }>(
    sandboxId,
    accessToken,
    { action: "evaluate", expression },
  );
  if (!res.ok) return { error: res.error };
  return { result: res.data.result };
}

export function createDefaultCdpTools() {
  return {
    takeScreenshot,
    capturePageSegments,
    navigateTo,
    scrollPage,
    analyzeElement,
    getUrl,
    clickElement,
    typeText,
    evaluateJs,
  };
}

export type CdpTools = ReturnType<typeof createDefaultCdpTools>;

/** Public live-view preview URL for the E2B Chromium sandbox (≠ CDP port). */
export function sandboxPreviewUrl(sandboxId: string): string {
  return `https://${PREVIEW_PORT}-${sandboxId}.${E2B_DOMAIN}`;
}

/** No-op — sandbox driver is stateless per action (Chrome stays in template). */
export function closeCdpSession(_sandboxId: string): void {
  /* intentional no-op */
}