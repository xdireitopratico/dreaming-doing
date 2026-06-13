/**
 * aetherforge-cron — Cron Processor for AetherForge
 * Reads agent_schedules due for execution and triggers them via gateway.
 * Also evaluates agent_alert_rules and creates notifications.
 * 
 * BUG FIXES: 30 (endpoint_slug), 31 (flow_id filter on alerts), 53 (P95 calc), 54-55 (cron day-of-week), 56 (advisory lock comment), 57 (is_active vs status)
 * 
 * Invoked every minute by pg_cron.
 * @version 1.1.0 — Batch 2 fixes
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const results = {
    schedules_processed: 0,
    schedules_triggered: 0,
    schedules_failed: 0,
    alerts_evaluated: 0,
    alerts_triggered: 0,
    hitl_timeouts: 0,
  };

  try {
    // ═══ 1. Process due schedules ═══
    const now = new Date().toISOString();
    const { data: dueSchedules } = await supabase
      .from("agent_schedules")
      .select("id, flow_id, cron_expression, input_payload, run_count, user_id, name")
      .eq("is_active", true)
      .lte("next_run_at", now)
      .limit(50);

    if (dueSchedules && dueSchedules.length > 0) {
      results.schedules_processed = dueSchedules.length;

      for (const schedule of dueSchedules) {
        try {
          // BUG 30 FIX: Select endpoint_slug (not slug) and filter by is_active (BUG 57 FIX)
          const { data: deployment } = await supabase
            .from("agent_deployments")
            .select("endpoint_slug")
            .eq("flow_id", schedule.flow_id)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();

          if (!deployment?.endpoint_slug) {
            await supabase.from("agent_schedules").update({
              last_run_at: now,
              last_status: "error",
              last_error: "No active deployment found",
            }).eq("id", schedule.id);
            results.schedules_failed++;
            continue;
          }

          // Trigger execution via gateway
          const gatewayUrl = `${supabaseUrl}/functions/v1/aetherforge-gateway`;
          const payload = (schedule.input_payload as Record<string, any>) || {};
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || supabaseKey;

          const res = await fetch(gatewayUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${anonKey}`,
            },
            body: JSON.stringify({
              slug: deployment.endpoint_slug, // BUG 30 FIX
              message: payload.message || `[Scheduled] ${schedule.name}`,
              session_id: `schedule_${schedule.id}_${Date.now()}`,
              channel: "schedule",
              metadata: {
                schedule_id: schedule.id,
                schedule_name: schedule.name,
                triggered_at: now,
                ...payload,
              },
            }),
          });

          const resBody = await res.json().catch(() => ({}));
          const nextRun = calculateNextRun(schedule.cron_expression);

          await supabase.from("agent_schedules").update({
            last_run_at: now,
            last_status: res.ok ? "success" : "error",
            last_error: res.ok ? null : (resBody.error || `HTTP ${res.status}`),
            next_run_at: nextRun,
            run_count: schedule.run_count + 1,
          }).eq("id", schedule.id);

          if (res.ok) {
            results.schedules_triggered++;
          } else {
            results.schedules_failed++;
          }
        } catch (err: any) {
          await supabase.from("agent_schedules").update({
            last_run_at: now,
            last_status: "error",
            last_error: err.message,
          }).eq("id", schedule.id);
          results.schedules_failed++;
        }
      }
    }

    // ═══ 2. Evaluate alert rules ═══
    const { data: alertRules } = await supabase
      .from("agent_alert_rules")
      .select("id, flow_id, name, rule_type, condition, user_id")
      .eq("is_active", true)
      .limit(100);

    if (alertRules && alertRules.length > 0) {
      results.alerts_evaluated = alertRules.length;

      for (const rule of alertRules) {
        try {
          const triggered = await evaluateAlertRule(supabase, rule);
          if (triggered) {
            await supabase.from("agent_notifications").insert({
              flow_id: rule.flow_id,
              user_id: rule.user_id,
              type: "alert",
              title: `⚠️ Alerta: ${rule.name}`,
              message: triggered.message,
              metadata: { rule_id: rule.id, rule_type: rule.rule_type, ...triggered },
            });
            results.alerts_triggered++;
          }
        } catch (err) {
          console.error(`[cron] Alert rule ${rule.id} failed:`, err);
        }
      }
    }

    // ═══ 3. Check HITL timeouts ═══
    const { data: timedOut } = await supabase
      .from("agent_executions")
      .select("id, pause_fallback_action, flow_id")
      .eq("is_paused", true)
      .lte("pause_timeout_at", now)
      .limit(50);

    if (timedOut && timedOut.length > 0) {
      for (const exec of timedOut) {
        const fallback = exec.pause_fallback_action || "abort";
        const newStatus = fallback === "continue" ? "completed" : "failed";

        await supabase.from("agent_executions").update({
          is_paused: false,
          status: newStatus,
          error_message: fallback === "abort" ? "HITL timeout — auto-aborted" : null,
        }).eq("id", exec.id);

        if (exec.flow_id) {
          const { data: flow } = await supabase.from("agent_flows").select("user_id").eq("id", exec.flow_id).maybeSingle();
          if (flow?.user_id) {
            await supabase.from("agent_notifications").insert({
              flow_id: exec.flow_id,
              user_id: flow.user_id,
              type: "alert",
              title: "⏰ HITL Timeout",
              message: `Execução ${exec.id.slice(0, 8)} expirou. Ação: ${fallback}`,
              metadata: { execution_id: exec.id, fallback_action: fallback },
            });
          }
        }

        results.hitl_timeouts++;
      }
    }

    console.log(`[aetherforge-cron] ✅ Done:`, results);

    return new Response(JSON.stringify({ ok: true, ...results, timestamp: now }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[aetherforge-cron] Fatal error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ═══════════════════════════════════════════════════════════
// CRON EXPRESSION → NEXT RUN
// BUG 54+55 FIX: Support day-of-week and more patterns
// ═══════════════════════════════════════════════════════════

function calculateNextRun(cronExpr: string): string {
  const now = new Date();
  const parts = cronExpr.trim().split(/\s+/);

  if (parts.length !== 5) {
    return new Date(now.getTime() + 3600000).toISOString();
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Every N minutes: */N * * * *
  if (minute.startsWith("*/")) {
    const interval = parseInt(minute.slice(2)) || 5;
    return new Date(now.getTime() + interval * 60000).toISOString();
  }

  // BUG 55 FIX: Check day-of-week constraint
  const targetMin = parseInt(minute) || 0;
  const hasDow = dayOfWeek !== "*";
  const dowTarget = hasDow ? parseInt(dayOfWeek) : -1;

  // Specific hour + day-of-week: M H * * D
  if (hour !== "*" && dayOfMonth === "*" && month === "*") {
    const targetHour = parseInt(hour) || 0;
    const next = new Date(now);
    next.setHours(targetHour, targetMin, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    
    // BUG 55 FIX: Advance to correct day-of-week
    if (hasDow) {
      while (next.getDay() !== dowTarget) {
        next.setDate(next.getDate() + 1);
      }
    }
    return next.toISOString();
  }

  // Every hour at minute M: M * * * * (with optional day-of-week)
  if (hour === "*" && dayOfMonth === "*") {
    const next = new Date(now);
    next.setMinutes(targetMin, 0, 0);
    if (next <= now) next.setHours(next.getHours() + 1);
    
    if (hasDow) {
      while (next.getDay() !== dowTarget) {
        next.setDate(next.getDate() + 1);
        next.setHours(0, targetMin, 0, 0);
      }
    }
    return next.toISOString();
  }

  // Default: 1 hour from now
  return new Date(now.getTime() + 3600000).toISOString();
}

// ═══════════════════════════════════════════════════════════
// ALERT RULE EVALUATION
// BUG 31 FIX: Filter by rule.flow_id in all queries
// ═══════════════════════════════════════════════════════════

async function evaluateAlertRule(
  supabase: any,
  rule: { id: string; flow_id: string; rule_type: string; condition: any },
): Promise<{ message: string; value?: number; threshold?: number } | null> {
  const condition = (rule.condition as Record<string, any>) || {};
  const windowMinutes = condition.window_minutes || 60;
  const since = new Date(Date.now() - windowMinutes * 60000).toISOString();

  // First get execution IDs for this specific flow
  const { data: flowExecs } = await supabase
    .from("agent_executions")
    .select("id")
    .eq("flow_id", rule.flow_id)
    .gte("created_at", since)
    .limit(500);

  const execIds = (flowExecs || []).map((e: any) => e.id);
  if (execIds.length === 0) return null;

  switch (rule.rule_type) {
    case "error_rate": {
      const threshold = condition.threshold_percent || 20;
      // BUG 31 FIX: Filter steps by execution_id IN execIds
      const { count: total } = await supabase
        .from("agent_execution_steps")
        .select("id", { count: "exact", head: true })
        .in("execution_id", execIds)
        .gte("started_at", since);

      const { count: failed } = await supabase
        .from("agent_execution_steps")
        .select("id", { count: "exact", head: true })
        .in("execution_id", execIds)
        .eq("status", "error")
        .gte("started_at", since);

      const rate = total && total > 0 ? ((failed || 0) / total) * 100 : 0;
      if (rate >= threshold) {
        return { message: `Taxa de erro ${rate.toFixed(1)}% excede limite de ${threshold}%`, value: rate, threshold };
      }
      return null;
    }

    case "budget": {
      const budgetCents = condition.budget_cents || 1000;
      // BUG 31 FIX: Filter by flow's executions
      const { data } = await supabase
        .from("agent_execution_steps")
        .select("cost_cents")
        .in("execution_id", execIds)
        .gte("started_at", since);

      const totalCost = (data || []).reduce((sum: number, s: any) => sum + (s.cost_cents || 0), 0);
      if (totalCost >= budgetCents) {
        return { message: `Custo $${(totalCost / 100).toFixed(2)} excede budget $${(budgetCents / 100).toFixed(2)}`, value: totalCost, threshold: budgetCents };
      }
      return null;
    }

    case "latency": {
      const thresholdMs = condition.threshold_ms || 5000;
      // BUG 31 FIX: Filter by flow's executions
      const { data } = await supabase
        .from("agent_execution_steps")
        .select("duration_ms")
        .in("execution_id", execIds)
        .gte("started_at", since)
        .not("duration_ms", "is", null)
        .order("duration_ms", { ascending: true }); // BUG 53 FIX: ascending for correct P95

      if (data && data.length > 0) {
        // BUG 53 FIX: Correct P95 calculation on ascending sorted data
        const p95Index = Math.floor(data.length * 0.95);
        const p95 = data[Math.min(p95Index, data.length - 1)]?.duration_ms || 0;
        if (p95 >= thresholdMs) {
          return { message: `P95 latência ${p95}ms excede limite de ${thresholdMs}ms`, value: p95, threshold: thresholdMs };
        }
      }
      return null;
    }

    default:
      return null;
  }
}
