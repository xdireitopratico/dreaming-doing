/**
 * prometheus-tool-executor — Edge function for Python VPS to call any Prometheus tool
 *
 * D4: TS reference engine + Python proxy. Python VPS calls this function
 * to execute tools instead of reimplementing them.
 *
 * Auth: Bearer VPS_TOKEN or service_role key
 * POST { tool_name, params, session_id, tenant_id? }
 */

import { supabaseAdmin } from "../_shared/prometheus-db.ts";
import { dispatchTool, type ToolContext } from "../_shared/prometheus-tools.ts";
import { forgeOrigin } from "../_shared/cors.ts";

const VPS_TOKEN = Deno.env.get("VPS_BRIDGE_TOKEN") || Deno.env.get("VPS_TOKEN") || "";

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": forgeOrigin(),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // Auth check — NEVER allow empty tokens
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!token || (!VPS_TOKEN && !serviceKey)) {
    return new Response(JSON.stringify({ error: "Server misconfigured: auth tokens not set" }), {
      status: 500,
    });
  }

  const encoder = new TextEncoder();
  const tokenBytes = encoder.encode(token);

  async function timingSafeEqual(a: Uint8Array, b: string): Promise<boolean> {
    const bBytes = encoder.encode(b);
    if (a.length !== bBytes.length) return false;
    const ka = await crypto.subtle.importKey("raw", a, { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    const kb = await crypto.subtle.importKey(
      "raw",
      bBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sa = await crypto.subtle.sign("HMAC", ka, new Uint8Array(32));
    const sb = await crypto.subtle.sign("HMAC", kb, new Uint8Array(32));
    const va = new Uint8Array(sa);
    const vb = new Uint8Array(sb);
    let diff = 0;
    for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
    return diff === 0;
  }

  const matchesVps = VPS_TOKEN ? await timingSafeEqual(tokenBytes, VPS_TOKEN) : false;
  const matchesService = serviceKey ? await timingSafeEqual(tokenBytes, serviceKey) : false;
  if (!matchesVps && !matchesService) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const body = await req.json();
    const { tool_name, params, session_id, tenant_id } = body;

    if (!tool_name) {
      return new Response(JSON.stringify({ error: "tool_name is required" }), { status: 400 });
    }
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id is required" }), { status: 400 });
    }

    // Load research cache from session
    const sb = supabaseAdmin();
    const { data: session } = await sb
      .from("prometheus_build_sessions")
      .select("research_cache")
      .eq("id", session_id)
      .single();

    const researchCache = (session?.research_cache || {}) as Record<string, unknown>;

    const ctx: ToolContext = {
      sessionId: session_id,
      supabase: sb,
      researchCache,
      tenantId: tenant_id,
    };

    const startMs = Date.now();
    const result = await dispatchTool(tool_name, params || {}, ctx);
    const durationMs = Date.now() - startMs;

    // Persist updated research cache back to session
    if (JSON.stringify(researchCache) !== JSON.stringify(session?.research_cache || {})) {
      await sb
        .from("prometheus_build_sessions")
        .update({ research_cache: researchCache })
        .eq("id", session_id);
    }

    return new Response(JSON.stringify({ result, duration_ms: durationMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("[prometheus-tool-executor] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
