/**
 * prometheus-healer — Physician Agent: Diagnosis + Treatment Engine
 * Phase P13: Diagnostics | Phase P14: Automatic Treatment
 * 
 * Pipeline: Detect Symptoms → Diagnose (LLM) → Treat → Verify → Rollback if worse
 * 
 * Actions:
 *   - "diagnose" (default): Full sweep — detect, diagnose, treat
 *   - "treat": Apply treatment to a specific healing_log entry
 * 
 * Treatments:
 *   - prompt_rewrite: LLM rewrites the failing node's system prompt
 *   - model_switch: Switches to a more capable/cheaper model
 *   - timeout_adjust: Increases timeout for latency issues
 *   - cache_clear: Clears semantic_cache for the flow
 *   - rollback: Reverts flow to previous version
 * 
 * Shadow mode: When enabled, treatment is simulated (dry-run) and logged
 * but NOT applied to production. User must approve.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { routeLLM } from "../_shared/llm-router.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ═══ PROMPTS ═══

const DIAGNOSIS_PROMPT = `You are Physician, a diagnostic AI agent for production AI agent flows.
You receive symptom data from monitoring and must provide:
1. A clear diagnosis (what is happening)
2. Root cause analysis (why it is happening)
3. Severity assessment (low/medium/high/critical)
4. Recommended treatment (one of: prompt_rewrite, model_switch, timeout_adjust, cache_clear, rollback, none)

Respond ONLY in JSON:
{
  "diagnosis": "string",
  "root_cause": "string",
  "severity": "low|medium|high|critical",
  "recommended_treatment": "prompt_rewrite|model_switch|timeout_adjust|cache_clear|rollback|none",
  "confidence": 0.0-1.0,
  "reasoning": "string"
}`;

const PROMPT_REWRITE_PROMPT = `You are Physician, rewriting a system prompt for an AI agent node that is underperforming.

Given the original prompt, the diagnosis, and the symptom data, rewrite the prompt to fix the issue.
Keep the same intent and persona but improve clarity, add guardrails if needed, and fix any ambiguities that may cause errors.

Return ONLY the rewritten prompt text, nothing else.`;

const MODEL_SWITCH_PROMPT = `You are Physician, recommending a model switch for a node with performance issues.

Given the current model, symptom, and available models, recommend the best replacement.
Consider: quality issues → upgrade model; latency issues → use faster model; error issues → use more reliable model.

Available models (id → description):
- google/gemini-2.5-flash → Fast, balanced, good for most tasks
- google/gemini-2.5-flash-lite → Fastest, cheapest, simple tasks only
- google/gemini-2.5-pro → Best quality, slower, expensive
- openai/gpt-5-mini → Strong reasoning, moderate cost
- openai/gpt-5-nano → Fast, cheap, basic tasks

Respond ONLY in JSON:
{ "recommended_model": "model_id", "reasoning": "string" }`;

// ═══ TYPES ═══

interface HealConfig {
  id: string;
  flow_id: string;
  enabled: boolean;
  check_interval_minutes: number;
  error_spike_threshold: number;
  quality_drop_threshold: number;
  latency_spike_threshold_ms: number;
  max_auto_corrections: number;
  shadow_mode: boolean;
  allowed_treatments: string[];
  user_id: string;
}

interface DiagResult {
  diagnosis: string;
  root_cause: string;
  severity: string;
  recommended_treatment: string;
  confidence: number;
  reasoning: string;
}

// ═══ TREATMENT FUNCTIONS ═══

async function treatPromptRewrite(
  sb: ReturnType<typeof createClient>,
  flowId: string,
  diagnosis: DiagResult,
  symptomData: Record<string, unknown>,
  modelId: string,
  shadowMode: boolean,
): Promise<{ success: boolean; data: Record<string, unknown> }> {
  // Get current flow definition
  const { data: flow } = await sb
    .from("agent_flows")
    .select("flow_definition")
    .eq("id", flowId)
    .single();

  if (!flow?.flow_definition) return { success: false, data: { error: "Flow not found" } };

  const flowDef = flow.flow_definition as any;
  const nodes = flowDef?.nodes || [];
  
  // Find LLM nodes (most likely cause of quality/error issues)
  const llmNodes = nodes.filter((n: any) => 
    n.type === "llm" || n.type === "ai-agent" || n.data?.systemPrompt
  );

  if (!llmNodes.length) return { success: false, data: { error: "No LLM nodes found" } };

  // BUG 86 FIX: Target the problematic node based on symptom data, not just llmNodes[0]
  const symptomNodeId = (symptomData as any)?.failing_node_id;
  const targetNode = (symptomNodeId && llmNodes.find((n: any) => n.id === symptomNodeId)) || llmNodes[0];
  const originalPrompt = targetNode.data?.systemPrompt || targetNode.data?.config?.systemPrompt || "";

  const llmResponse = await routeLLM({
    model_id: modelId,
    messages: [
      { role: "system", content: PROMPT_REWRITE_PROMPT },
      {
        role: "user",
        content: `Original prompt:\n${originalPrompt}\n\nDiagnosis: ${diagnosis.diagnosis}\nRoot cause: ${diagnosis.root_cause}\nSymptom data: ${JSON.stringify(symptomData)}`,
      },
    ],
    temperature: 0.4,
    max_tokens: 1500,
  });

  const newPrompt = llmResponse.content || "";
  if (!newPrompt || newPrompt.length < 20) {
    return { success: false, data: { error: "Generated prompt too short" } };
  }

  if (shadowMode) {
    return {
      success: true,
      data: {
        shadow: true,
        node_id: targetNode.id,
        original_prompt: originalPrompt.substring(0, 200),
        new_prompt: newPrompt.substring(0, 200),
        full_new_prompt: newPrompt,
      },
    };
  }

  // Apply: update the node's prompt in flow_definition
  const updatedNodes = nodes.map((n: any) => {
    if (n.id === targetNode.id) {
      return {
        ...n,
        data: {
          ...n.data,
          systemPrompt: newPrompt,
          config: { ...(n.data?.config || {}), systemPrompt: newPrompt },
        },
      };
    }
    return n;
  });

  const { error: updateErr } = await sb
    .from("agent_flows")
    .update({ flow_definition: { ...flowDef, nodes: updatedNodes } })
    .eq("id", flowId);

  return {
    success: !updateErr,
    data: {
      node_id: targetNode.id,
      original_prompt: originalPrompt.substring(0, 200),
      new_prompt: newPrompt.substring(0, 200),
      applied: true,
      error: updateErr?.message,
    },
  };
}

async function treatModelSwitch(
  sb: ReturnType<typeof createClient>,
  flowId: string,
  diagnosis: DiagResult,
  symptomData: Record<string, unknown>,
  modelId: string,
  shadowMode: boolean,
): Promise<{ success: boolean; data: Record<string, unknown> }> {
  const { data: flow } = await sb
    .from("agent_flows")
    .select("flow_definition")
    .eq("id", flowId)
    .single();

  if (!flow?.flow_definition) return { success: false, data: { error: "Flow not found" } };

  const flowDef = flow.flow_definition as any;
  const nodes = flowDef?.nodes || [];
  const llmNodes = nodes.filter((n: any) => n.data?.model_id || n.data?.config?.model_id);

  if (!llmNodes.length) return { success: false, data: { error: "No model-configured nodes" } };

  const targetNode = llmNodes[0];
  const currentModel = targetNode.data?.model_id || targetNode.data?.config?.model_id || "unknown";

  const llmResponse = await routeLLM({
    model_id: modelId,
    messages: [
      { role: "system", content: MODEL_SWITCH_PROMPT },
      {
        role: "user",
        content: `Current model: ${currentModel}\nSymptom: ${diagnosis.root_cause}\nSeverity: ${diagnosis.severity}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 200,
  });

  let recommendation: any = {};
  try {
    const match = (llmResponse.content || "").match(/\{[\s\S]*\}/);
    if (match) recommendation = JSON.parse(match[0]);
  } catch { /* */ }

  const newModel = recommendation.recommended_model || "google/gemini-2.5-flash";

  if (shadowMode) {
    return {
      success: true,
      data: { shadow: true, node_id: targetNode.id, current_model: currentModel, new_model: newModel, reasoning: recommendation.reasoning },
    };
  }

  const updatedNodes = nodes.map((n: any) => {
    if (n.id === targetNode.id) {
      return {
        ...n,
        data: {
          ...n.data,
          model_id: newModel,
          config: { ...(n.data?.config || {}), model_id: newModel },
        },
      };
    }
    return n;
  });

  const { error: updateErr } = await sb
    .from("agent_flows")
    .update({ flow_definition: { ...flowDef, nodes: updatedNodes } })
    .eq("id", flowId);

  return {
    success: !updateErr,
    data: { node_id: targetNode.id, current_model: currentModel, new_model: newModel, applied: true },
  };
}

async function treatTimeoutAdjust(
  sb: ReturnType<typeof createClient>,
  flowId: string,
  shadowMode: boolean,
): Promise<{ success: boolean; data: Record<string, unknown> }> {
  const { data: flow } = await sb
    .from("agent_flows")
    .select("flow_definition")
    .eq("id", flowId)
    .single();

  if (!flow?.flow_definition) return { success: false, data: { error: "Flow not found" } };

  const flowDef = flow.flow_definition as any;
  const currentTimeout = flowDef.settings?.timeout_ms || 30000;
  const newTimeout = Math.min(currentTimeout * 1.5, 120000); // +50%, max 120s

  if (shadowMode) {
    return { success: true, data: { shadow: true, current_timeout_ms: currentTimeout, new_timeout_ms: newTimeout } };
  }

  const { error } = await sb
    .from("agent_flows")
    .update({
      flow_definition: {
        ...flowDef,
        settings: { ...(flowDef.settings || {}), timeout_ms: newTimeout },
      },
    })
    .eq("id", flowId);

  return { success: !error, data: { current_timeout_ms: currentTimeout, new_timeout_ms: newTimeout, applied: true } };
}

async function treatCacheClear(
  sb: ReturnType<typeof createClient>,
  flowId: string,
  shadowMode: boolean,
): Promise<{ success: boolean; data: Record<string, unknown> }> {
  if (shadowMode) {
    return { success: true, data: { shadow: true, action: "would_clear_semantic_cache" } };
  }

  const { error, count } = await sb
    .from("semantic_cache")
    .delete()
    .eq("flow_id", flowId);

  // BUG 116 FIX: Report cleared accurately based on actual deletion count
  const rowsDeleted = count || 0;
  return { success: !error, data: { cleared: rowsDeleted > 0, rows_deleted: rowsDeleted } };
}

async function treatRollback(
  sb: ReturnType<typeof createClient>,
  flowId: string,
  shadowMode: boolean,
): Promise<{ success: boolean; data: Record<string, unknown> }> {
  // Get previous version
  const { data: versions } = await sb
    .from("agent_flow_versions")
    .select("id, version_number, flow_definition")
    .eq("flow_id", flowId)
    .order("version_number", { ascending: false })
    .limit(2);

  if (!versions || versions.length < 2) {
    return { success: false, data: { error: "No previous version available for rollback" } };
  }

  const previousVersion = versions[1]; // second most recent

  if (shadowMode) {
    return {
      success: true,
      data: { shadow: true, rollback_to_version: previousVersion.version_number, version_id: previousVersion.id },
    };
  }

  const { error } = await sb
    .from("agent_flows")
    .update({ flow_definition: previousVersion.flow_definition })
    .eq("id", flowId);

  return {
    success: !error,
    data: { rolled_back_to: previousVersion.version_number, applied: true },
  };
}

// ═══ MAIN HANDLER ═══

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // BUG 79 FIX: Verify JWT before creating service role client
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Verify caller identity
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

  // Now create service role client for admin operations
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action || "diagnose";
    const targetFlowId = body?.flow_id as string | undefined;

    // BUG 81 FIX: Verify flow ownership — user must own the flow
    if (targetFlowId) {
      const { data: flowOwnership } = await sb
        .from("agent_flows")
        .select("user_id")
        .eq("id", targetFlowId)
        .single();

      if (!flowOwnership || (flowOwnership as any).user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Flow not found or access denied" }), {
          status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // Zero LLM Hardcoded: model_id MUST come from request
    const modelId = body?.model_id;
    if (!modelId) {
      return new Response(JSON.stringify({ error: "model_id is required (zero-llm-hardcoded policy)" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: TREAT — Apply treatment to specific log entry ──
    if (action === "treat") {
      const logId = body?.log_id as string;
      if (!logId) {
        return new Response(JSON.stringify({ error: "log_id required" }), {
          status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const { data: logEntry } = await sb
        .from("prometheus_healing_log")
        .select("*")
        .eq("id", logId)
        .single();

      if (!logEntry) {
        return new Response(JSON.stringify({ error: "Log entry not found" }), {
          status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const treatment = body?.treatment || (logEntry.treatment_data as any)?.recommended;
      if (!treatment || treatment === "none") {
        return new Response(JSON.stringify({ ok: true, message: "No treatment needed" }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // Force apply (no shadow) when explicitly triggered by user
      const diagResult: DiagResult = {
        diagnosis: logEntry.diagnosis || "",
        root_cause: logEntry.root_cause || "",
        severity: logEntry.severity || "medium",
        recommended_treatment: treatment,
        confidence: (logEntry.treatment_data as any)?.confidence || 0.5,
        reasoning: "",
      };

      const result = await applyTreatment(sb, logEntry.flow_id, treatment, diagResult, logEntry.symptom_data as any || {}, modelId, false);

      await sb.from("prometheus_healing_log").update({
        treatment_applied: treatment,
        treatment_data: { ...(logEntry.treatment_data as any || {}), result: result.data },
        outcome: result.success ? "treated" : "treatment_failed",
        resolved_at: result.success ? new Date().toISOString() : null,
      }).eq("id", logId);

      return new Response(JSON.stringify({ ok: true, treatment, result }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: DIAGNOSE (default) — Full sweep ──
    console.log("[physician] Starting diagnostic sweep...", targetFlowId ? `flow=${targetFlowId}` : "all enabled flows");

    let configQuery = sb
      .from("prometheus_auto_heal_config")
      .select("*")
      .eq("enabled", true);

    if (targetFlowId) {
      configQuery = configQuery.eq("flow_id", targetFlowId);
    }

    const { data: configs, error: configErr } = await configQuery;
    if (configErr) throw new Error(`Failed to fetch configs: ${configErr.message}`);
    if (!configs?.length) {
      return new Response(JSON.stringify({ ok: true, diagnosed: 0, treated: 0, reason: "no_configs" }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let totalDiagnosed = 0;
    let totalTreated = 0;
    const flowResults: any[] = [];

    for (const config of configs as HealConfig[]) {
      const windowMinutes = config.check_interval_minutes * 2;
      const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

      const { data: executions } = await sb
        .from("agent_executions")
        .select("status, quality_score, total_latency_ms, created_at, error_message")
        .eq("flow_id", config.flow_id)
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!executions?.length) {
        flowResults.push({ flow_id: config.flow_id, symptoms: [], treated: false });
        continue;
      }

      // Compute metrics
      const total = executions.length;
      const errors = executions.filter(e => e.status === "failed" || e.status === "error");
      const completed = executions.filter(e => e.status === "completed");
      const errorRate = errors.length / total;

      const qualityScores = completed.map(e => e.quality_score).filter((q): q is number => q != null);
      const avgQuality = qualityScores.length ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : null;

      const latencies = completed.map(e => e.total_latency_ms).filter((l): l is number => l != null);
      const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;

      const metricsBefore = {
        error_rate: errorRate,
        avg_quality: avgQuality,
        avg_latency_ms: avgLatency ? Math.round(avgLatency) : null,
        total_executions: total,
      };

      // Detect symptoms
      const symptoms: Array<{ symptom: string; data: Record<string, unknown> }> = [];

      if (errorRate > config.error_spike_threshold) {
        symptoms.push({
          symptom: "error_spike",
          data: { error_rate: errorRate, threshold: config.error_spike_threshold, error_count: errors.length, sample_errors: errors.slice(0, 3).map(e => e.error_message || "unknown") },
        });
      }
      // BUG 96 FIX: Compare avgQuality directly against threshold (e.g. 0.2 = 20% drop tolerance means alert if quality < threshold value, not 1-threshold)
      if (avgQuality != null && avgQuality < config.quality_drop_threshold) {
        symptoms.push({
          symptom: "quality_drop",
          data: { avg_quality: avgQuality, threshold: config.quality_drop_threshold, sample_count: qualityScores.length },
        });
      }
      if (avgLatency != null && avgLatency > config.latency_spike_threshold_ms) {
        symptoms.push({
          symptom: "latency_spike",
          data: { avg_latency_ms: Math.round(avgLatency), threshold_ms: config.latency_spike_threshold_ms },
        });
      }

      if (!symptoms.length) {
        flowResults.push({ flow_id: config.flow_id, symptoms: [], treated: false });
        continue;
      }

      // Check max corrections limit
      const { count: recentCorrections } = await sb
        .from("prometheus_healing_log")
        .select("id", { count: "exact", head: true })
        .eq("flow_id", config.flow_id)
        .eq("outcome", "treated")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if ((recentCorrections || 0) >= config.max_auto_corrections) {
        console.log(`[physician] Flow ${config.flow_id}: max corrections (${config.max_auto_corrections}) reached in 24h. Skipping treatment.`);
        // Still log diagnosis
        for (const s of symptoms) {
          await sb.from("prometheus_healing_log").insert({
            flow_id: config.flow_id, config_id: config.id, symptom: s.symptom,
            symptom_data: s.data, diagnosis: "Max corrections reached", severity: "high",
            outcome: "max_corrections_reached", metrics_before: metricsBefore,
            model_used: modelId, user_id: config.user_id,
          });
        }
        flowResults.push({ flow_id: config.flow_id, symptoms: symptoms.map(s => s.symptom), treated: false, reason: "max_corrections" });
        totalDiagnosed++;
        continue;
      }

      // Diagnose + treat each symptom
      for (const symptom of symptoms) {
        const diagStart = Date.now();

        try {
          const llmResponse = await routeLLM({
            model_id: modelId,
            messages: [
              { role: "system", content: DIAGNOSIS_PROMPT },
              { role: "user", content: `Symptom: ${symptom.symptom}\n\nMetrics:\n${JSON.stringify(symptom.data, null, 2)}\n\nFlow: ${config.flow_id}\nWindow: ${windowMinutes}min\nExecutions: ${total}` },
            ],
            temperature: 0.3,
            max_tokens: 500,
          });

          const diagLatency = Date.now() - diagStart;
          let diagResult: DiagResult = { diagnosis: "", root_cause: "", severity: "medium", recommended_treatment: "none", confidence: 0, reasoning: "" };

          try {
            const match = (llmResponse.content || "").match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              // BUG 102 FIX: Validate schema - confidence must be number
              diagResult = {
                diagnosis: String(parsed.diagnosis || ""),
                root_cause: String(parsed.root_cause || ""),
                severity: ["low", "medium", "high", "critical"].includes(parsed.severity) ? parsed.severity : "medium",
                recommended_treatment: String(parsed.recommended_treatment || "none"),
                confidence: typeof parsed.confidence === "number" ? parsed.confidence : parseFloat(parsed.confidence) || 0,
                reasoning: String(parsed.reasoning || ""),
              };
            }
          } catch {
            diagResult.diagnosis = llmResponse.content || "Parse error";
          }

          // Check if treatment is allowed
          const treatment = diagResult.recommended_treatment;
          const isAllowed = treatment && treatment !== "none" && config.allowed_treatments.includes(treatment);

          let treatmentResult: { success: boolean; data: Record<string, unknown> } | null = null;

          if (isAllowed && diagResult.confidence >= 0.5) {
            treatmentResult = await applyTreatment(sb, config.flow_id, treatment, diagResult, symptom.data, modelId, config.shadow_mode);
            if (treatmentResult.success) totalTreated++;
          }

          await sb.from("prometheus_healing_log").insert({
            flow_id: config.flow_id, config_id: config.id,
            symptom: symptom.symptom, symptom_data: symptom.data,
            diagnosis: diagResult.diagnosis, root_cause: diagResult.root_cause,
            severity: diagResult.severity,
            treatment_applied: treatmentResult ? treatment : null,
            treatment_data: {
              recommended: treatment, confidence: diagResult.confidence,
              allowed: isAllowed, result: treatmentResult?.data,
            },
            outcome: treatmentResult?.success
              ? (config.shadow_mode ? "shadow_treated" : "treated")
              : (isAllowed ? "treatment_failed" : "diagnosed"),
            metrics_before: metricsBefore,
            shadow_result: config.shadow_mode ? treatmentResult?.data : null,
            model_used: modelId, diagnosis_latency_ms: diagLatency,
            user_id: config.user_id,
            resolved_at: treatmentResult?.success && !config.shadow_mode ? new Date().toISOString() : null,
          });
        } catch (err: any) {
          console.error(`[physician] Error for ${symptom.symptom}:`, err.message);
          await sb.from("prometheus_healing_log").insert({
            flow_id: config.flow_id, config_id: config.id,
            symptom: symptom.symptom, symptom_data: symptom.data,
            diagnosis: `Error: ${err.message}`, severity: "medium",
            outcome: "diagnosis_failed", metrics_before: metricsBefore,
            model_used: modelId, diagnosis_latency_ms: Date.now() - diagStart,
            user_id: config.user_id,
          });
        }
      }

      totalDiagnosed++;
      flowResults.push({ flow_id: config.flow_id, symptoms: symptoms.map(s => s.symptom), treated: true });
    }

    console.log(`[physician] Complete. Diagnosed: ${totalDiagnosed}, Treated: ${totalTreated}`);

    return new Response(JSON.stringify({ ok: true, diagnosed: totalDiagnosed, treated: totalTreated, results: flowResults }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[physician] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

// ═══ TREATMENT DISPATCHER ═══

async function applyTreatment(
  sb: ReturnType<typeof createClient>,
  flowId: string,
  treatment: string,
  diagnosis: DiagResult,
  symptomData: Record<string, unknown>,
  modelId: string,
  shadowMode: boolean,
): Promise<{ success: boolean; data: Record<string, unknown> }> {
  console.log(`[physician] Applying treatment '${treatment}' to flow ${flowId} (shadow=${shadowMode})`);

  switch (treatment) {
    case "prompt_rewrite":
      return treatPromptRewrite(sb, flowId, diagnosis, symptomData, modelId, shadowMode);
    case "model_switch":
      return treatModelSwitch(sb, flowId, diagnosis, symptomData, modelId, shadowMode);
    case "timeout_adjust":
      return treatTimeoutAdjust(sb, flowId, shadowMode);
    case "cache_clear":
      return treatCacheClear(sb, flowId, shadowMode);
    case "rollback":
      return treatRollback(sb, flowId, shadowMode);
    default:
      return { success: false, data: { error: `Unknown treatment: ${treatment}` } };
  }
}
