/**
 * browser-cdp-tools — Reusable typed CDP tools for the browser agent.
 *
 * Controls Chrome in an E2B sandbox via the E2B envd CDP relay.
 * Exports: cdpSend, evaluateJs, takeScreenshot, navigateTo, scrollPage,
 *          analyzeElement, getUrl, clickElement, typeText.
 */

const E2B_DOMAIN = Deno.env.get("E2B_DOMAIN") || "e2b.app";
const CDP_PORT = 9222;

export type CdpRelayFn = (
  sandboxId: string,
  accessToken: string | null,
  method: string,
  params?: Record<string, unknown>,
) => Promise<unknown>;

export type EvaluateJsFn = (
  sandboxId: string,
  accessToken: string | null,
  expression: string,
) => Promise<{ result?: unknown; error?: string }>;

/** Execute a CDP command via the E2B envd relay. */
export async function cdpSend(
  sandboxId: string,
  accessToken: string | null,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const url = `https://sandbox.${E2B_DOMAIN}/cdp`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "E2b-Sandbox-Id": sandboxId,
    "E2b-Sandbox-Port": String(CDP_PORT),
  };
  if (accessToken) headers["X-Access-Token"] = accessToken;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: 1, method, params: params ?? {} }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CDP relay ${res.status}: ${text.slice(0, 200)}`);
  }

  return await res.json();
}

/** Execute JavaScript in the browser page and return a serializable value. */
export async function evaluateJs(
  sandboxId: string,
  accessToken: string | null,
  expression: string,
): Promise<{ result?: unknown; error?: string }> {
  const response = await cdpSend(sandboxId, accessToken, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }) as { result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } } };

  if (response.result?.exceptionDetails) {
    return { error: response.result.exceptionDetails.text ?? "JS evaluation error" };
  }
  return { result: response.result?.result?.value };
}

/** Capture a screenshot as base64 PNG. */
export async function takeScreenshot(
  sandboxId: string,
  accessToken: string | null,
  fullPage = false,
  deps: { cdpSend?: CdpRelayFn } = {},
): Promise<{ base64: string; error?: string }> {
  const send = deps.cdpSend ?? cdpSend;
  try {
    const response = await send(sandboxId, accessToken, "Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: fullPage,
    }) as { result?: { data?: string } };
    return { base64: response.result?.data ?? "" };
  } catch (err) {
    return { base64: "", error: (err as Error).message };
  }
}

/** Navigate the browser to a URL and wait for the load event. */
export async function navigateTo(
  sandboxId: string,
  accessToken: string | null,
  url: string,
  deps: { cdpSend?: CdpRelayFn } = {},
): Promise<{ success: boolean; error?: string }> {
  const send = deps.cdpSend ?? cdpSend;
  try {
    await send(sandboxId, accessToken, "Page.navigate", { url });
    await send(sandboxId, accessToken, "Page.loadEventFired", {});
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** Scroll the page to a vertical offset. */
export async function scrollPage(
  sandboxId: string,
  accessToken: string | null,
  y: number,
  deps: { evaluateJs?: EvaluateJsFn } = {},
): Promise<{ success: boolean; error?: string }> {
  const run = deps.evaluateJs ?? evaluateJs;
  try {
    await run(sandboxId, accessToken, `window.scrollTo(0, ${y}); "scrolled"`);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** Extract element metadata for a CSS selector. */
export async function analyzeElement(
  sandboxId: string,
  accessToken: string | null,
  selector: string,
  deps: { evaluateJs?: EvaluateJsFn } = {},
): Promise<{
  tagName?: string;
  text?: string;
  html?: string;
  rect?: Record<string, unknown>;
  styles?: Record<string, string>;
  error?: string;
}> {
  const run = deps.evaluateJs ?? evaluateJs;
  const js = `
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { error: 'Element not found: ${selector.replace(/'/g, "\'")}' };
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
  const res = await run(sandboxId, accessToken, js);
  return (res.result as {
    tagName?: string;
    text?: string;
    html?: string;
    rect?: Record<string, unknown>;
    styles?: Record<string, string>;
    error?: string;
  }) ?? { error: res.error ?? "Unknown evaluation error" };
}

/** Return the current page URL. */
export async function getUrl(
  sandboxId: string,
  accessToken: string | null,
  deps: { evaluateJs?: EvaluateJsFn } = {},
): Promise<{ url: string; error?: string }> {
  const run = deps.evaluateJs ?? evaluateJs;
  try {
    const res = await run(sandboxId, accessToken, "window.location.href");
    return { url: String(res.result ?? "") };
  } catch (err) {
    return { url: "", error: (err as Error).message };
  }
}

/** Click the first element matching a CSS selector. */
export async function clickElement(
  sandboxId: string,
  accessToken: string | null,
  selector: string,
  deps: { evaluateJs?: EvaluateJsFn } = {},
): Promise<{ success: boolean; error?: string }> {
  const run = deps.evaluateJs ?? evaluateJs;
  try {
    await run(sandboxId, accessToken, `document.querySelector(${JSON.stringify(selector)})?.click(); "clicked"`);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** Type text into the first input matching a CSS selector. */
export async function typeText(
  sandboxId: string,
  accessToken: string | null,
  selector: string,
  text: string,
  deps: { evaluateJs?: EvaluateJsFn } = {},
): Promise<{ success: boolean; error?: string }> {
  const run = deps.evaluateJs ?? evaluateJs;
  try {
    const escaped = text.replace(/"/g, '\\"');
    await run(sandboxId, accessToken, `
      const el = document.querySelector(${JSON.stringify(selector)});
      if (el) { el.focus(); el.value = "${escaped}"; el.dispatchEvent(new Event('input', { bubbles: true })); }
      "typed"
    `);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
