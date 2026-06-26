/**
 * prometheus-builder — Edge Function entry point
 *
 * FORGE v1: all models run inline via prometheus-cortex.ts (EdgeRuntime.waitUntil).
 * No VPS Celery / KVM8 routing.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  startSession,
  processMessage,
  processIntent,
  summarizeSession,
} from "../_shared/prometheus-cortex.ts";
import { runPhysician } from "../_shared/prometheus-physician.ts";
import { getCodexReport, generateOptimizationInsights } from "../_shared/prometheus-codex.ts";
import type { PrometheusRequest } from "../_shared/prometheus-types.ts";
import { forgeOrigin } from "../_shared/cors.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const body: PrometheusRequest = await req.json();
    let result: unknown;

    switch (body.action) {
      case "start": {
        const qualityModel = body.model_id || (body.briefing?.quality_model as string) || "";
        if (!qualityModel) {
          return new Response(JSON.stringify({ error: "model_id is required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        console.log(`[prometheus-builder] Starting inline cortex (${qualityModel})`);
        const { session_id, ok, backgroundTask } = await startSession(
          user.id,
          body.briefing || {},
          body.flow_id,
          qualityModel,
          body.intent === "modify" ? "modify" : "create",
        );
        EdgeRuntime.waitUntil(backgroundTask);
        result = { session_id, ok };
        break;
      }

      case "message": {
        if (!body.session_id || !body.message) {
          return new Response(JSON.stringify({ error: "session_id and message required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        const { ok, backgroundTask } = await processMessage(body.session_id, user.id, body.message);
        EdgeRuntime.waitUntil(backgroundTask);
        result = { ok };
        break;
      }

      case "summarize": {
        if (!body.session_id) {
          return new Response(JSON.stringify({ error: "session_id required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        result = await summarizeSession(body.session_id, user.id);
        break;
      }

      case "status": {
        if (!body.session_id) {
          return new Response(JSON.stringify({ error: "session_id required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { data, error } = await sb
          .from("prometheus_build_sessions")
          .select("id, phase, success")
          .eq("id", body.session_id)
          .eq("user_id", user.id)
          .single();
        if (error || !data) throw new Error("Session not found");
        result = { session_id: data.id, phase: data.phase, done: data.phase === "complete" };
        break;
      }

      case "approve":
      case "request_changes":
      case "reject_plan":
      case "halt": {
        if (!body.session_id) {
          return new Response(JSON.stringify({ error: "session_id required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
        const { ok, backgroundTask } = await processIntent(
          body.session_id,
          user.id,
          body.action,
          body.feedback || body.message,
        );
        EdgeRuntime.waitUntil(backgroundTask);
        result = { ok };
        break;
      }

      case "skip": {
        if (body.session_id) {
          const { ok, backgroundTask } = await processIntent(body.session_id, user.id, "halt");
          EdgeRuntime.waitUntil(backgroundTask);
          result = { ok, halted: true };
        } else {
          result = { ok: true, skipped: true };
        }
        break;
      }

      case "codex_report":
        result = await getCodexReport(user.id);
        break;

      case "codex_insights": {
        const insightModel = body.model_id || "google/gemini-2.5-flash";
        result = await generateOptimizationInsights(user.id, insightModel);
        break;
      }

      case "physician": {
        if (!body.flow_id) {
          return new Response(JSON.stringify({ error: "flow_id required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
        const modelId = body.model_id || "google/gemini-2.5-flash";
        result = await runPhysician(body.flow_id, user.id, modelId, user.id);
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[prometheus-builder] Error:", err);
    const errMsg = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
