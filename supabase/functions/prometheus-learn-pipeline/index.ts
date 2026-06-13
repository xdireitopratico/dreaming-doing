/**
 * prometheus-learn-pipeline — Weekly aggregation of execution data
 * Phase P12: Learns from real agent executions to improve genome selection
 * Called by pg_cron weekly. Aggregates agent_executions metrics for flows
 * built by Prometheus into codex_empirical_performance.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // BUG 115 FIX: Only accept POST
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // BUG 80 FIX: Verify JWT before proceeding
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await anonClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Service role client for aggregation
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    console.log("[learn-pipeline] Starting weekly execution aggregation...");

    // 1. Find all Prometheus-built sessions that have output_flow_id
    const { data: sessions, error: sessErr } = await sb
      .from("prometheus_build_sessions")
      .select("id, output_flow_id, architecture, requirements, quality_model")
      .not("output_flow_id", "is", null)
      .eq("success", true);

    if (sessErr) throw new Error(`Failed to fetch sessions: ${sessErr.message}`);
    if (!sessions?.length) {
      console.log("[learn-pipeline] No completed sessions found. Nothing to aggregate.");
      return new Response(JSON.stringify({ ok: true, aggregated: 0 }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    console.log(`[learn-pipeline] Found ${sessions.length} completed sessions to analyze.`);

    // 2. Get flow_ids to query executions
    const flowIds = sessions
      .map(s => s.output_flow_id)
      .filter(Boolean) as string[];

    if (!flowIds.length) {
      return new Response(JSON.stringify({ ok: true, aggregated: 0 }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 3. Aggregate executions per flow (last 7 days only for incremental)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: executions, error: execErr } = await sb
      .from("agent_executions")
      .select("flow_id, status, quality_score, total_latency_ms, user_satisfaction_score, completed_at, nodes_executed")
      .in("flow_id", flowIds)
      .gte("created_at", oneWeekAgo)
      .not("status", "is", null);

    if (execErr) {
      console.error("[learn-pipeline] Failed to fetch executions:", execErr.message);
      throw new Error(`Failed to fetch executions: ${execErr.message}`);
    }

    if (!executions?.length) {
      console.log("[learn-pipeline] No recent executions found for Prometheus-built flows.");
      return new Response(JSON.stringify({ ok: true, aggregated: 0, reason: "no_recent_executions" }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    console.log(`[learn-pipeline] Found ${executions.length} executions in last 7 days.`);

    // 4. Group executions by flow_id
    const flowExecMap: Record<string, typeof executions> = {};
    for (const exec of executions) {
      if (!exec.flow_id) continue;
      if (!flowExecMap[exec.flow_id]) flowExecMap[exec.flow_id] = [];
      flowExecMap[exec.flow_id].push(exec);
    }

    // 5. Build session lookup: flow_id → session
    const sessionByFlow: Record<string, typeof sessions[0]> = {};
    for (const s of sessions) {
      if (s.output_flow_id) sessionByFlow[s.output_flow_id] = s;
    }

    // 6. For each flow, compute aggregated metrics and upsert into codex_empirical_performance
    let aggregated = 0;
    const inserts: any[] = [];

    for (const [flowId, execs] of Object.entries(flowExecMap)) {
      const session = sessionByFlow[flowId];
      if (!session) continue;

      const arch = session.architecture as any;
      const genomeId = arch?.genome_id;
      if (!genomeId || genomeId === "fallback") continue;

      const completed = execs.filter(e => e.status === "completed");
      const failed = execs.filter(e => e.status === "failed");
      const total = execs.length;

      if (total === 0) continue;

      const passRate = completed.length / total;
      const qualityScores = completed
        .map(e => e.quality_score)
        .filter((q): q is number => q != null);
      const avgQuality = qualityScores.length
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : null;

      const latencies = completed
        .map(e => e.total_latency_ms)
        .filter((l): l is number => l != null);
      const avgLatency = latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null;

      const satisfactionScores = execs
        .map(e => e.user_satisfaction_score)
        .filter((s): s is number => s != null);
      const avgSatisfaction = satisfactionScores.length
        ? Math.round(satisfactionScores.reduce((a, b) => a + b, 0) / satisfactionScores.length)
        : null;

      inserts.push({
        genome_id: genomeId,
        session_id: session.id,
        build_success: true,
        pass_rate: passRate,
        avg_quality: avgQuality,
        total_latency_ms: avgLatency,
        iterations_needed: 1, // runtime, not build iterations
        auto_corrections: 0,
        build_time_seconds: null,
        model_used: session.quality_model || null,
        domain: (session.requirements as any)?.domain || null,
        complexity: (session.requirements as any)?.complexity || null,
        nodes_count: arch?.nodes?.length || null,
        user_feedback_score: avgSatisfaction,
      });

      aggregated++;
    }

    // 7. Batch insert
    if (inserts.length > 0) {
      const { error: insertErr } = await sb
        .from("codex_empirical_performance")
        .insert(inserts);

      if (insertErr) {
        console.error("[learn-pipeline] Failed to insert aggregated data:", insertErr.message);
        throw new Error(`Insert failed: ${insertErr.message}`);
      }

      console.log(`[learn-pipeline] Successfully aggregated ${aggregated} flow(s) into codex_empirical_performance.`);
    }

    return new Response(JSON.stringify({
      ok: true,
      aggregated,
      executions_analyzed: executions.length,
      flows_with_data: Object.keys(flowExecMap).length,
    }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[learn-pipeline] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
