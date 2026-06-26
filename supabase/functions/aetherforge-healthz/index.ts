/**
 * AetherForge Health Check — /healthz endpoint for K8s probes
 *
 * Verifica conectividade com banco, latência, e status de serviços.
 * Usado por liveness/readiness probes no Kubernetes.
 *
 * GET / → Health summary
 * GET /?deep=true → Deep check (DB + services)
 *
 * Max: ~120 linhas (anti-monolítico)
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { forgeOrigin } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime_seconds: number;
  timestamp: string;
  checks: Record<
    string,
    {
      status: "pass" | "fail";
      latency_ms: number;
      message?: string;
    }
  >;
}

const startTime = Date.now();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const deep = url.searchParams.get("deep") === "true";

  const health: HealthCheck = {
    status: "healthy",
    version: "2.0.0",
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: {},
  };

  // Basic: runtime check
  health.checks.runtime = { status: "pass", latency_ms: 0, message: "Deno Edge Runtime" };

  // Basic: memory check
  try {
    const memStart = Date.now();
    // Simple allocation test
    const _arr = new Array(1000).fill(0);
    health.checks.memory = { status: "pass", latency_ms: Date.now() - memStart };
  } catch {
    health.checks.memory = { status: "fail", latency_ms: 0, message: "Memory allocation failed" };
    health.status = "unhealthy";
  }

  // Deep: database connectivity
  if (deep) {
    try {
      const dbStart = Date.now();
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { count, error } = await supabase
        .from("agent_flows")
        .select("id", { count: "exact", head: true });

      const dbLatency = Date.now() - dbStart;

      if (error) {
        health.checks.database = { status: "fail", latency_ms: dbLatency, message: error.message };
        health.status = "degraded";
      } else {
        health.checks.database = {
          status: "pass",
          latency_ms: dbLatency,
          message: `${count ?? 0} flows`,
        };
      }
    } catch (err) {
      health.checks.database = { status: "fail", latency_ms: 0, message: (err as Error).message };
      health.status = "unhealthy";
    }

    // Deep: check critical env vars
    const requiredEnvs = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    const missingEnvs = requiredEnvs.filter((e) => !Deno.env.get(e));
    health.checks.environment = {
      status: missingEnvs.length === 0 ? "pass" : "fail",
      latency_ms: 0,
      message:
        missingEnvs.length === 0
          ? "All required vars present"
          : `Missing: ${missingEnvs.join(", ")}`,
    };
    if (missingEnvs.length > 0) health.status = "unhealthy";

    // Deep: check edge function availability
    try {
      const fnStart = Date.now();
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const res = await fetch(`${supabaseUrl}/functions/v1/aetherforge-api-proxy`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      health.checks.api_proxy = {
        status: res.ok ? "pass" : "fail",
        latency_ms: Date.now() - fnStart,
        message: `HTTP ${res.status}`,
      };
      if (!res.ok) health.status = "degraded";
    } catch (err) {
      health.checks.api_proxy = { status: "fail", latency_ms: 0, message: (err as Error).message };
      health.status = "degraded";
    }
  }

  const httpStatus = health.status === "unhealthy" ? 503 : 200;

  return new Response(JSON.stringify(health, null, 2), {
    status: httpStatus,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store",
    },
  });
});
