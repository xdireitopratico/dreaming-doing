/**
 * design-library-actions — Execute browser actions in E2B sandbox via CDP.
 *
 * Supports: navigate, screenshot (base64), scroll, click, type, analyze (DOM extract),
 *           evaluate (custom JS), get_url, get_screenshot_url.
 *
 * Auth: any authenticated user can act on sandboxes from their own jobs.
 * BYOK: E2B key loaded from user's connectors (kind="e2b").
 *
 * Body:
 *   {
 *     jobId: string,
 *     action: string,
 *     params?: Record<string, unknown>,
 *     sandboxId?: string  // optional override; auto-detected from job if missing
 *   }
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { forgeOrigin } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const E2B_API_BASE = Deno.env.get("E2B_API_BASE") || "https://api.e2b.app";
const E2B_DOMAIN = Deno.env.get("E2B_DOMAIN") || "e2b.app";
const CDP_PORT = 9222;

interface ActionRequest {
  jobId: string;
  action: string;
  params?: Record<string, unknown>;
  sandboxId?: string;
}

/** Execute CDP command via E2B envd relay */
async function cdpSend(
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

/** Execute JavaScript in the browser page */
async function evaluateJs(
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

/** Take a screenshot and return as base64 PNG */
async function takeScreenshot(
  sandboxId: string,
  accessToken: string | null,
  fullPage = false,
): Promise<{ base64: string; error?: string }> {
  try {
    const response = await cdpSend(sandboxId, accessToken, "Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: fullPage,
    }) as { result?: { data?: string } };

    return { base64: response.result?.data ?? "" };
  } catch (err) {
    return { base64: "", error: (err as Error).message };
  }
}

/** Navigate to a URL */
async function navigateTo(
  sandboxId: string,
  accessToken: string | null,
  url: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await cdpSend(sandboxId, accessToken, "Page.navigate", { url });
    // Wait for load
    await cdpSend(sandboxId, accessToken, "Page.loadEventFired", {});
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** Scroll the page */
async function scrollPage(
  sandboxId: string,
  accessToken: string | null,
  y: number,
): Promise<{ success: boolean; error?: string }> {
  return evaluateJs(sandboxId, accessToken, `window.scrollTo(0, ${y}); "scrolled"`)
    .then(() => ({ success: true }))
    .catch((err) => ({ success: false, error: (err as Error).message }));
}

/** Extract DOM content for a selector */
async function analyzeElement(
  sandboxId: string,
  accessToken: string | null,
  selector: string,
): Promise<{ result?: string; error?: string }> {
  const js = `
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { error: 'Element not found: ${selector.replace(/'/g, "\\'")}' };
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
  return evaluateJs(sandboxId, accessToken, js);
}

/** Load E2B key from user's connectors */
async function loadE2bKey(
  supabase: any,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("connectors")
    .select("token_encrypted")
    .eq("owner_id", userId)
    .eq("kind", "e2b")
    .maybeSingle();

  if (error) {
    console.error("[design-library-actions] connector fetch failed:", error.message);
    return null;
  }

  const tokens = (data?.token_encrypted ?? "").trim().split("\n");
  return tokens[0]?.trim() || null;
}

/** Get E2B access token for a sandbox */
async function getSandboxAccessToken(
  sandboxId: string,
  e2bApiKey: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${E2B_API_BASE}/sandboxes/${sandboxId}/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": e2bApiKey,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const data = await res.json() as { accessToken?: string };
    return data.accessToken ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase: any = createClient(supabaseUrl, supabaseKey);
    const token = auth.replace(/^Bearer\s+/i, "");

    // Auth check
    let userId: string | null = null;
    let isServiceRole = false;
    try {
      const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
      isServiceRole = payload.role === "service_role";
    } catch { /* not JWT */ }

    if (!isServiceRole) {
      const userClient: any = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY") ?? supabaseKey,
        { global: { headers: { Authorization: auth } } },
      );
      const { data: userData } = await userClient.auth.getUser();
      userId = userData?.user?.id ?? null;
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const input: ActionRequest = await req.json();
    if (!input.jobId || !input.action) {
      return new Response(JSON.stringify({ error: "jobId and action required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get sandbox from job
    const { data: job, error: jobErr } = await supabase
      .from("design_dna_jobs")
      .select("id, user_id, sandbox_id, status, meta")
      .eq("id", input.jobId)
      .maybeSingle();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: jobErr?.message ?? "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: user can only act on their own jobs (service_role bypasses)
    if (!isServiceRole && job.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sandboxId = input.sandboxId ?? job.sandbox_id;
    if (!sandboxId) {
      return new Response(
        JSON.stringify({ error: "No sandbox attached to this job", action: input.action }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load E2B key from job owner (or calling user as fallback)
    const e2bOwnerId = job.user_id ?? userId;
    if (!e2bOwnerId) {
      return new Response(
        JSON.stringify({ error: "Cannot determine E2B key owner" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const e2bApiKey = await loadE2bKey(supabase, e2bOwnerId);
    if (!e2bApiKey) {
      return new Response(
        JSON.stringify({ error: "E2B API key not configured. Add it in Conectores (kind=e2b)." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessToken = await getSandboxAccessToken(sandboxId, e2bApiKey);

    // Dispatch action
    let result: unknown;
    switch (input.action) {
      case "navigate": {
        const url = String(input.params?.url ?? "");
        if (!url) return new Response(JSON.stringify({ error: "url required for navigate" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        result = await navigateTo(sandboxId, accessToken, url);
        break;
      }
      case "screenshot": {
        const fullPage = Boolean(input.params?.fullPage);
        result = await takeScreenshot(sandboxId, accessToken, fullPage);
        break;
      }
      case "scroll": {
        const y = Number(input.params?.y ?? 500);
        result = await scrollPage(sandboxId, accessToken, y);
        break;
      }
      case "click": {
        const x = Number(input.params?.x ?? 0);
        const y = Number(input.params?.y ?? 0);
        result = await cdpSend(sandboxId, accessToken, "Input.dispatchMouseEvent", {
          type: "mousePressed", x, y, button: "left", clickCount: 1,
        }).then(() => cdpSend(sandboxId, accessToken, "Input.dispatchMouseEvent", {
          type: "mouseReleased", x, y, button: "left", clickCount: 1,
        }));
        break;
      }
      case "type": {
        const text = String(input.params?.text ?? "");
        result = await cdpSend(sandboxId, accessToken, "Input.insertText", { text });
        break;
      }
      case "analyze": {
        const selector = String(input.params?.selector ?? "body");
        result = await analyzeElement(sandboxId, accessToken, selector);
        break;
      }
      case "evaluate": {
        const expression = String(input.params?.expression ?? "document.title");
        result = await evaluateJs(sandboxId, accessToken, expression);
        break;
      }
      case "get_url": {
        result = await evaluateJs(sandboxId, accessToken, "window.location.href");
        break;
      }
      case "get_screenshot_url": {
        const meta = (job.meta ?? {}) as Record<string, unknown>;
        const previewUrl = meta.previewUrl as string | undefined;
        result = { previewUrl: previewUrl ?? `https://3000-${sandboxId}.${E2B_DOMAIN}` };
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${input.action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(
      JSON.stringify({ ok: true, action: input.action, sandboxId, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[design-library-actions] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
