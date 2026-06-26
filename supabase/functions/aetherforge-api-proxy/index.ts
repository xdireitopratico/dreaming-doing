/**
 * AetherForge API Proxy — Public REST API for agent execution
 * 
 * Auth: API key (from tenant_secrets) or Supabase JWT
 * Rate limit: Simple in-memory counter per tenant (resets on cold start)
 * Forwards to aetherforge-gateway for actual execution
 * 
 * Endpoints:
 *   POST /  → Execute agent (body: { slug, message, session_id? })
 *   GET  /  → API info + health
 * 
 * Max: ~140 linhas (anti-monolítico)
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-tenant-id",
};

// Simple in-memory rate limiter (resets on cold start)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_PER_MINUTE = 60;

function checkRateLimit(tenantId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimits.get(tenantId);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(tenantId, { count: 1, resetAt: now + 60000 });
    return { allowed: true, remaining: RATE_LIMIT_PER_MINUTE - 1 };
  }

  if (entry.count >= RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_PER_MINUTE - entry.count };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // GET → API info
  if (req.method === "GET") {
    return new Response(JSON.stringify({
      api: "AetherForge Public API",
      version: "1.0",
      endpoints: {
        "POST /": "Execute agent — body: { slug, message, session_id?, channel? }",
      },
      auth: "Header X-API-Key or Authorization: Bearer <jwt>",
      rate_limit: `${RATE_LIMIT_PER_MINUTE} requests/minute per tenant`,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Authenticate
    const apiKey = req.headers.get("x-api-key");
    const authHeader = req.headers.get("authorization");
    let tenantId = req.headers.get("x-tenant-id") || "anonymous";

    if (apiKey) {
      // BUG 22 FIX: Use hashed comparison — lookup by secret_name only, then constant-time compare
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: secrets } = await supabase
        .from("tenant_secrets")
        .select("tenant_id, secret_value")
        .eq("secret_name", "api_key")
        .limit(100);

      let matchedTenantId: string | null = null;
      if (secrets) {
        const encoder = new TextEncoder();
        const keyBytes = encoder.encode(apiKey);
        for (const s of secrets) {
          const storedBytes = encoder.encode((s as any).secret_value || "");
          if (keyBytes.length !== storedBytes.length) continue;
          let diff = 0;
          for (let i = 0; i < keyBytes.length; i++) diff |= keyBytes[i] ^ storedBytes[i];
          if (diff === 0) matchedTenantId = (s as any).tenant_id;
        }
      }

      if (!matchedTenantId) {
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      tenantId = matchedTenantId;
    } else if (authHeader?.startsWith("Bearer ")) {
      // JWT auth — verify via Supabase
      const supabase = createClient(supabaseUrl, supabaseKey);
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Invalid JWT token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      tenantId = user.id;
    } else {
      return new Response(JSON.stringify({ error: "Authentication required. Use X-API-Key or Authorization: Bearer <jwt>" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Rate limit
    const rateCheck = checkRateLimit(tenantId);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded", retry_after_seconds: 60 }), {
        status: 429,
        headers: {
          ...corsHeaders, "Content-Type": "application/json",
          "X-RateLimit-Remaining": "0",
          "Retry-After": "60",
        },
      });
    }

    // 3. Forward to gateway
    const body = await req.json();
    if (!body.slug || !body.message) {
      return new Response(JSON.stringify({ error: "slug and message are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anonKey) {
      console.error("[API Proxy] SUPABASE_ANON_KEY not set — refusing to fall back to service role key");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const gatewayResponse = await fetch(`${supabaseUrl}/functions/v1/aetherforge-gateway`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        slug: body.slug,
        message: body.message,
        session_id: body.session_id,
        channel: body.channel || "api",
        metadata: { ...body.metadata, tenant_id: tenantId, via: "api-proxy" },
      }),
    });

    // BUG 48 FIX: catch JSON parse errors
    let result;
    try {
      result = await gatewayResponse.json();
    } catch {
      result = { error: "Invalid response from gateway", status: gatewayResponse.status };
    }

    return new Response(JSON.stringify(result), {
      status: gatewayResponse.status,
      headers: {
        ...corsHeaders, "Content-Type": "application/json",
        "X-RateLimit-Remaining": String(rateCheck.remaining),
        // BUG 73 FIX: Don't expose tenant UUID
      },
    });
  } catch (err) {
    console.error("[API Proxy] Error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
