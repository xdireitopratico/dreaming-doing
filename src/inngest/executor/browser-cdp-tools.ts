/**
 * browser-cdp-tools — CDP tools backed by a WebSocket connection to Chrome DevTools.
 *
 * Connects to wss://9222-<sandboxId>.e2b.app/ (E2B Chromium sandbox) and uses real
 * CDP events like Page.loadEventFired instead of polling.
 */

import { errorMessage } from "@/lib/error-utils";
import {
  CdpWebSocketClient,
  getGlobalCdpClient,
} from "./browser-cdp-websocket";
import { PREVIEW_PORT } from "./design-dna-preview";

const E2B_DOMAIN =
  (typeof process !== "undefined" ? process.env.E2B_DOMAIN : undefined) ||
  "e2b.app";
const NAVIGATE_TIMEOUT_MS = 60_000;

export type CdpClient = CdpWebSocketClient;

function getClient(
  sandboxId: string,
  accessToken: string | null,
): CdpClient {
  return getGlobalCdpClient(sandboxId, accessToken);
}

async function ensurePageSession(client: CdpClient): Promise<void> {
  await client.ensurePageAttached();
}

export async function takeScreenshot(
  sandboxId: string,
  accessToken: string | null,
  fullPage = false,
): Promise<{ base64: string; error?: string }> {
  const client = getClient(sandboxId, accessToken);
  try {
    await ensurePageSession(client);
    const response = (await client.sendOnPage("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: fullPage,
    })) as { data?: string };
    return { base64: response.data ?? "", error: response.data ? undefined : "Screenshot data missing" };
  } catch (err) {
    return { base64: "", error: errorMessage(err) };
  }
}

export async function navigateTo(
  sandboxId: string,
  accessToken: string | null,
  url: string,
): Promise<{ success: boolean; error?: string }> {
  const client = getClient(sandboxId, accessToken);
  try {
    await ensurePageSession(client);

    // Wait for the next Page.loadEventFired *before* sending navigate so we
    // don't miss the event for fast loads.
    const loadEventPromise = client.once("Page.loadEventFired", NAVIGATE_TIMEOUT_MS);

    await client.sendOnPage("Page.navigate", { url });

    await loadEventPromise;
    return { success: true };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

export async function scrollPage(
  sandboxId: string,
  accessToken: string | null,
  y: number,
): Promise<{ success: boolean; error?: string }> {
  const res = await runJs(
    sandboxId,
    accessToken,
    `window.scrollTo(0, ${y}); "scrolled"`,
    "scroll",
  );
  return { success: !res.error, error: res.error };
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
  const js = `
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { error: "Element not found: " + ${JSON.stringify(selector)} };
      return {
        tagName: el.tagName,
        text: el.textContent?.slice(0, 500) || '',
        html: el.outerHTML.slice(0, 1000),
        rect: el.getBoundingClientRect(),
        styles: {
          color: getComputedStyle(el).color,
          fontSize: getComputedStyle(el).fontSize,
          fontFamily: getComputedStyle(el).fontFamily,
          backgroundColor: getComputedStyle(el).backgroundColor,
        }
      };
    })()
  `;
  const res = await runJs(sandboxId, accessToken, js, "analyze");
  if (res.error) return { error: res.error };
  return (res.result as {
    tagName?: string;
    text?: string;
    html?: string;
    rect?: Record<string, unknown>;
    styles?: Record<string, string>;
    error?: string;
  }) ?? { error: "Unknown evaluation error" };
}

export async function getUrl(
  sandboxId: string,
  accessToken: string | null,
): Promise<{ url: string; error?: string }> {
  const res = await runJs(sandboxId, accessToken, "window.location.href", "get_url");
  return { url: String(res.result ?? ""), error: res.error };
}

export async function clickElement(
  sandboxId: string,
  accessToken: string | null,
  selector: string,
): Promise<{ success: boolean; error?: string }> {
  const js = `
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { success: false, error: "Element not found" };
      el.click();
      return { success: true };
    })()
  `;
  const res = await runJs(sandboxId, accessToken, js, "click");
  if (res.error) return { success: false, error: res.error };
  const outcome = res.result as { success: boolean; error?: string } | undefined;
  if (outcome && outcome.success === false) {
    return { success: false, error: outcome.error ?? "Element not found" };
  }
  return { success: true };
}

export async function typeText(
  sandboxId: string,
  accessToken: string | null,
  selector: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  const js = `
    const value = ${JSON.stringify(text)};
    const el = document.querySelector(${JSON.stringify(selector)});
    if (el) { el.focus(); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
    "typed"
  `;
  const res = await runJs(sandboxId, accessToken, js, "type");
  return { success: !res.error, error: res.error };
}

export async function evaluateJs(
  sandboxId: string,
  accessToken: string | null,
  expression: string,
): Promise<{ result?: unknown; error?: string }> {
  return runJs(sandboxId, accessToken, expression, "evaluate");
}

async function runJs(
  sandboxId: string,
  accessToken: string | null,
  expression: string,
  label: string,
): Promise<{ result?: unknown; error?: string }> {
  const client = getClient(sandboxId, accessToken);
  try {
    await ensurePageSession(client);
    const response = (await client.sendOnPage("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as {
      result?: { value?: unknown };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    };

    if (response.exceptionDetails) {
      return {
        error:
          response.exceptionDetails.exception?.description ??
          response.exceptionDetails.text ??
          `${label} JS evaluation error`,
      };
    }
    return { result: response.result?.value };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export function createDefaultCdpTools() {
  return {
    takeScreenshot,
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

export function closeCdpSession(sandboxId: string): void {
  // The global client will be replaced on next getClient call; explicitly
  // closing is optional because the global getter closes stale clients.
  getGlobalCdpClient(sandboxId, null).close();
}
