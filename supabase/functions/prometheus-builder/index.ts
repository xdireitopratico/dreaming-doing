/**
 * prometheus-builder — Edge Function entry point
 * 
 * Bifurcated routing:
 *   - Cloud models (Gemini, GPT, Groq, etc.) → inline via prometheus-cortex.ts
 *   - Ollama models → VPS Celery worker (long-running)
 * 
 * Lightweight actions (status, skip, physician, codex) always inline.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { isOllamaModel } from "../_shared/llm-router.ts";
import { startSession, processMessage, summarizeSession } from "../_shared/prometheus-cortex.ts";
import { runPhysician } from "../_shared/prometheus-physician.ts";
import { getCodexReport, generateOptimizationInsights } from "../_shared/prometheus-codex.ts";
import type { PrometheusRequest } from "../_shared/prometheus-types.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VPS_CELERY_URL = Deno.env.get("VPS_CELERY_URL") || "";
const VPS_TOKEN = Deno.env.get("VPS_POST_PRODUCTION_TOKEN") || "";

/**
 * Submit a Prometheus orchestration job to VPS Celery worker.
 * ONLY used for Ollama models that exceed Edge Function timeout.
 */
async function submitToVps(payload: Record<string, unknown>): Promise<{ job_id: string }> {
  if (!VPS_CELERY_URL || !VPS_TOKEN) {
    throw new Error("VPS_CELERY_URL or VPS_POST_PRODUCTION_TOKEN not configured");
  }

  const res = await fetch(`${VPS_CELERY_URL}/api/v1/jobs/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${VPS_TOKEN}`,
    },
    body: JSON.stringify({
      job_type: "prometheus_orchestrate",
      ...payload,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new Error(`VPS submit failed (${res.status}): ${errText.substring(0, 300)}`);
  }

  return res.json();
}

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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const body: PrometheusRequest = await req.json();
    let result: any;

    switch (body.action) {

      // ═══ START ═══
      case "start": {
        const qualityModel = body.model_id || (body.briefing?.quality_model as string) || "";
        if (!qualityModel) {
          return new Response(JSON.stringify({ error: "model_id is required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        if (isOllamaModel(qualityModel)) {
          // ── Ollama → VPS Celery (async, long-running) ──
          console.log(`[prometheus-builder] Ollama model detected (${qualityModel}), routing to VPS`);
          const sb = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          );
          const { data: sessionData, error: sessionError } = await sb
            .from("prometheus_build_sessions")
            .insert({
              user_id: user.id,
              intent: "create",
              phase: "discovery",
              messages: [],
              requirements: body.briefing || null,
              target_flow_id: body.flow_id || null,
              quality_model: qualityModel,
            })
            .select("id")
            .single();
          if (sessionError || !sessionData) {
            throw new Error(`Failed to create session: ${sessionError?.message}`);
          }
          const vpsResult = await submitToVps({
            session_id: sessionData.id,
            user_id: user.id,
            action: "start",
            briefing: body.briefing || {},
            model_id: qualityModel,
          });
          result = { session_id: sessionData.id, ok: true, job_id: vpsResult.job_id };
        } else {
          // ── Cloud model → inline engine (single source of truth) ──
          // Runs the complete self-chaining FSM (enrichment → analyst → planning →
          // architect → approval) in a background task via EdgeRuntime.waitUntil,
          // the same proven path used by the "message" action. No external worker /
          // job queue / cron is involved.
          console.log(`[prometheus-builder] Cloud model detected (${qualityModel}), running inline cortex engine`);
          const { session_id, ok, backgroundTask } = await startSession(
            user.id,
            body.briefing || {},
            body.flow_id,
            qualityModel,
          );
          EdgeRuntime.waitUntil(backgroundTask);
          result = { session_id, ok };
        }
        break;
      }

      // ═══ MESSAGE ═══
      case "message": {
        if (!body.session_id || !body.message) {
          return new Response(JSON.stringify({ error: "session_id and message required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        // Fetch session to check model
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { data: session } = await sb
          .from("prometheus_build_sessions")
          .select("quality_model")
          .eq("id", body.session_id)
          .eq("user_id", user.id)
          .single();

        if (!session) throw new Error("Session not found");

        if (isOllamaModel(session.quality_model)) {
          // ── Ollama → VPS ──
          const vpsResult = await submitToVps({
            session_id: body.session_id,
            user_id: user.id,
            action: "message",
            message: body.message,
          });
          result = { ok: true, job_id: vpsResult.job_id };
        } else {
          // ── Cloud → inline ──
          const { ok, backgroundTask } = await processMessage(
            body.session_id,
            user.id,
            body.message,
          );
          EdgeRuntime.waitUntil(backgroundTask);
          result = { ok };
        }
        break;
      }

      // ═══ SUMMARIZE ═══
      case "summarize": {
        if (!body.session_id) {
          return new Response(JSON.stringify({ error: "session_id required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        // Fetch session to check model
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { data: session } = await sb
          .from("prometheus_build_sessions")
          .select("quality_model")
          .eq("id", body.session_id)
          .eq("user_id", user.id)
          .single();

        if (!session) throw new Error("Session not found");

        if (isOllamaModel(session.quality_model)) {
          const vpsResult = await submitToVps({
            session_id: body.session_id,
            user_id: user.id,
            action: "summarize",
          });
          result = { ok: true, job_id: vpsResult.job_id };
        } else {
          result = await summarizeSession(body.session_id, user.id);
        }
        break;
      }

      // ═══ LIGHTWEIGHT ACTIONS (always inline) ═══

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

      case "skip":
        result = { ok: true, skipped: true };
        break;

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
        result = await runPhysician(body.flow_id, user.id, modelId);
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
