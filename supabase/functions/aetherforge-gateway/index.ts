/**
 * AetherForge Gateway — Thin Router (Refactored R44.5 + ROADMAP-03 Phase 1)
 * 
 * All business logic extracted to _shared/gateway-*.ts modules:
 * - gateway-core.ts: Node executors, health check, HITLPauseSignal
 * - gateway-whatsapp.ts: Evolution API V1 channel
 * - gateway-voice.ts: STT/TTS/Voice pipeline
 * - gateway-saga.ts: Saga compensation, DLQ, HITL decide
 * 
 * Phase 1: Added action "test" — accepts flow_id directly without deployment
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { cacheLookup, cacheSave } from "../_shared/semantic-cache.ts";
import { applyOutputGuards, getDefaultGuardConfig, type GuardConfig } from "../_shared/output-guards.ts";
import { evaluateOutput, type EvalScores } from "../_shared/eval-layer.ts";
import { routeCanary, type CanaryConfig } from "../_shared/canary-router.ts";

import {
  corsHeaders, HITLPauseSignal,
  executeLLMNode, executeNodeInline, executeToolNode, executeMemoryNode, executeSubFlowNode, executeVisionNode,
  handleHealthCheck,
} from "../_shared/gateway-core.ts";
import { handleWhatsAppIncoming, handleWhatsAppSend } from "../_shared/gateway-whatsapp.ts";
import { handleVoicePipeline, handleDirectTTS, executeSTTNode, executeTTSNode } from "../_shared/gateway-voice.ts";
import { handleDLQRetry, handleHITLDecide, executeSagaCompensation } from "../_shared/gateway-saga.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return handleHealthCheck();
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    // ═══ Action Router ═══
    switch (body.action) {
      case "health":        return handleHealthCheck();
      case "test":          return await testFlow(body);
      case "hitl_decide":   return handleHITLDecide(body);
      case "whatsapp_incoming": return handleWhatsAppIncoming(body);
      case "whatsapp_send": return handleWhatsAppSend(body);
      case "voice":         return handleVoicePipeline(body);
      case "tts":           return handleDirectTTS(body);
      case "dlq_retry":     return handleDLQRetry(body);
    }

    // ═══ Default: Flow Execution (slug-based) ═══
    return await executeFlow(body);

  } catch (err) {
    console.error("AetherForge Gateway error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ═══════════════════════════════════════════════════════════
// Shared Supabase client initializer
// ═══════════════════════════════════════════════════════════

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

// ═══════════════════════════════════════════════════════════
// testFlow — Phase 1: Accept flow_id directly, no deployment needed
// ═══════════════════════════════════════════════════════════

async function testFlow(body: any): Promise<Response> {
  const supabase = getSupabaseClient();
  const { flow_id, message, session_id, channel = "test", metadata = {} } = body;

  if (!flow_id || !message) {
    return new Response(
      JSON.stringify({ error: "flow_id and message are required for test action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Load flow directly by ID — accepts draft, trial, published, active
  const { data: flow, error: flowErr } = await supabase
    .from("agent_flows")
    .select("id, name, flow_definition, status")
    .eq("id", flow_id)
    .single();

  if (flowErr || !flow) {
    return new Response(JSON.stringify({ error: "Flow not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate flow has nodes
  const flowDef = flow.flow_definition as { nodes?: any[]; edges?: any[] };
  const nodes = flowDef?.nodes || [];
  if (nodes.length === 0) {
    return new Response(JSON.stringify({ error: "Flow has no nodes. Add nodes before testing." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check that LLM nodes have model_id
  const llmNodes = nodes.filter((n: any) => n.type === "llm");
  const unconfiguredLLM = llmNodes.find((n: any) => !n.data?.config?.model_id && !n.data?.config?.modelId);
  if (unconfiguredLLM) {
    const label = unconfiguredLLM.data?.label || unconfiguredLLM.id;
    return new Response(JSON.stringify({ 
      error: `Configure o modelo no nó LLM "${label}" antes de testar.`,
      error_code: "MODEL_NOT_CONFIGURED",
      node_id: unconfiguredLLM.id,
    }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[Gateway/Test] Testing flow ${flow_id} (${flow.name}) status=${flow.status}`);

  // Execute using shared internal function — deployment_id is null for test
  return await executeFlowInternal(supabase, {
    flow,
    flowDef,
    deploymentId: null,
    message,
    sessionId: session_id || crypto.randomUUID(),
    channel,
    metadata: { ...metadata, test_mode: true },
    canaryConfig: null,
  });
}

// ═══════════════════════════════════════════════════════════
// executeFlow — Original slug-based execution (production path)
// ═══════════════════════════════════════════════════════════

async function executeFlow(body: any): Promise<Response> {
  const supabase = getSupabaseClient();
  const { slug, message, session_id, channel = "web", metadata = {} } = body;

  if (!slug || !message) {
    return new Response(
      JSON.stringify({ error: "slug and message are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 1. Find published deployment
  const { data: deployment, error: deployErr } = await supabase
    .from("agent_deployments")
    .select("id, flow_id, channel_config, is_active, canary_percent, canary_baseline_version_id, canary_version_id")
    .eq("endpoint_slug", slug)
    .eq("is_active", true)
    .single();

  if (deployErr || !deployment) {
    return new Response(JSON.stringify({ error: "Agent not found or not active" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Load flow definition
  const { data: flow, error: flowErr } = await supabase
    .from("agent_flows")
    .select("id, name, flow_definition, status")
    .eq("id", deployment.flow_id)
    .single();

  if (flowErr || !flow || !["published", "active", "trial"].includes(flow.status)) {
    return new Response(JSON.stringify({ error: "Flow not found or not published" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const flowDef = flow.flow_definition as { nodes?: any[]; edges?: any[] };

  // Canary routing
  const canaryConfig: CanaryConfig = {
    canary_percent: (deployment as any).canary_percent || 0,
    canary_version_id: (deployment as any).canary_version_id || null,
    baseline_version_id: (deployment as any).canary_baseline_version_id || null,
  };

  const effectiveSessionId = session_id || crypto.randomUUID();

  return await executeFlowInternal(supabase, {
    flow,
    flowDef,
    deploymentId: deployment.id,
    message,
    sessionId: effectiveSessionId,
    channel,
    metadata,
    canaryConfig,
  });
}

// ═══════════════════════════════════════════════════════════
// executeFlowInternal — Shared BFS execution engine
// Used by both testFlow (flow_id-based) and executeFlow (slug-based)
// ═══════════════════════════════════════════════════════════

interface FlowExecParams {
  flow: { id: string; name: string; flow_definition: any; status: string };
  flowDef: { nodes?: any[]; edges?: any[] };
  deploymentId: string | null;
  message: string;
  sessionId: string;
  channel: string;
  metadata: Record<string, any>;
  canaryConfig: CanaryConfig | null;
}

async function executeFlowInternal(supabase: any, params: FlowExecParams): Promise<Response> {
  const { flow, flowDef, deploymentId, message, sessionId, channel, metadata, canaryConfig } = params;

  const nodes = flowDef?.nodes || [];
  const edges = flowDef?.edges || [];

  // Canary routing (only for production paths with canary config)
  let canaryDecision = { is_canary: false, version_id: null as string | null, reason: "no_canary", percent: 0 };
  if (canaryConfig && canaryConfig.canary_percent > 0) {
    canaryDecision = routeCanary(sessionId, canaryConfig);
    if (canaryDecision.is_canary) {
      console.log(`[Gateway/Canary] Session ${sessionId} routed to CANARY`);
    }
  }

  // Create or resume execution
  let executionId: string;
  let isNewExecution = true;
  const stateSnapshot = { channel, metadata, message, variables: {} };

  // Try to resume existing session
  const { data: existing } = await supabase
    .from("agent_executions")
    .select("id, status")
    .eq("session_id", sessionId)
    .eq("flow_id", flow.id)
    .in("status", ["running", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    executionId = existing.id;
    isNewExecution = false;
  }

  if (isNewExecution) {
    const { data: newExec, error: execErr } = await supabase
      .from("agent_executions")
      .insert({
        flow_id: flow.id,
        deployment_id: deploymentId,
        session_id: sessionId,
        status: "running",
        current_state: nodes.find((n: any) => n.type === "trigger")?.type || null,
        fsm_snapshot: stateSnapshot,
      })
      .select("id")
      .single();

    if (execErr || !newExec) {
      return new Response(JSON.stringify({ error: "Failed to create execution" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    executionId = newExec.id;
  }

  // Try KVM8 executor first
  const KVM8_IP = Deno.env.get("KVM8_IP");
  const KVM8_PROTOCOL = Deno.env.get("KVM8_PROTOCOL") || "https";
  const KVM8_PORT = Deno.env.get("KVM8_PORT") || "8890";
  const triggerNode = nodes.find((n: any) => n.type === "trigger");

  if (!triggerNode) {
    await supabase.from("agent_executions").update({ status: "failed", error: "No trigger node found" }).eq("id", executionId!);
    return new Response(JSON.stringify({ error: "Flow has no trigger node" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (KVM8_IP) {
    try {
      const executorUrl = `${KVM8_PROTOCOL}://${KVM8_IP}:${KVM8_PORT}/execute`;
      const executorRes = await fetch(executorUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execution_id: executionId, flow_id: flow.id, flow_definition: flowDef, message, channel, metadata, state_snapshot: stateSnapshot }),
        signal: AbortSignal.timeout(55000),
      });
      if (executorRes.ok) {
        const executorResult = await executorRes.json();
        console.log("[Gateway] KVM8 executor responded successfully");
        return new Response(JSON.stringify(executorResult), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`[Gateway] KVM8 executor returned ${executorRes.status}`);
    } catch (err) {
      console.log(`[Gateway] KVM8 unreachable, inline fallback: ${(err as Error).message}`);
    }
  } else {
    console.log("[Gateway] KVM8_IP not configured, using inline executor");
  }

  // Inline BFS execution with saga compensation
  console.log("[Gateway] Using inline executor fallback");
  const executionSteps: any[] = [];
  const completedSteps: { nodeId: string; node: any; output: any; input: any }[] = [];
  const visited = new Set<string>();
  const queue: { nodeId: string; input: any }[] = [{ nodeId: triggerNode.id, input: { message, channel, metadata } }];
  let finalOutput: any = null;
  let stepOrder = 0;
  let sagaTriggered = false;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostCents = 0;
  const executionStart = Date.now();

  while (queue.length > 0) {
    const { nodeId, input } = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodes.find((n: any) => n.id === nodeId);
    if (!node) continue;

    stepOrder++;
    const stepStart = Date.now();
    await supabase.from("agent_executions").update({ current_state: nodeId }).eq("id", executionId);

    let output: any;
    let stepStatus = "completed";
    let stepCostCents = 0;

    try {
      if (node.type === "llm") {
        const cacheEnabled = flow.flow_definition?.settings?.semantic_cache !== false;
        if (cacheEnabled) {
          const cacheResult = await cacheLookup(flow.id, input.message || input.response || message);
          if (cacheResult.hit && cacheResult.cached_response) {
            console.log(`[Gateway] Semantic cache HIT (sim=${cacheResult.similarity?.toFixed(3)})`);
            output = { response: cacheResult.cached_response, model: "cache", provider: "semantic_cache", tokens: { prompt: 0, completion: 0, total: 0 }, cost_cents: 0, cache_hit: true, cache_similarity: cacheResult.similarity };
          }
        }
        if (!output) {
          output = await executeLLMNode(node, input, message, flow.id);
          stepCostCents = output.cost_cents || 0;
          if (cacheEnabled && output.response && !output.error) {
            const inputText = input.message || input.response || message;
            const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inputText));
            const inputHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
            cacheSave({ flow_id: flow.id, input_text: inputText, input_hash: inputHash, response_text: output.response, model_id: output.model || "", tokens_saved: output.tokens?.total || 0, cost_saved_cents: output.cost_cents || 0 }).catch(() => {});
          }
        }
      } else if (node.type === "memory") {
        output = await executeMemoryNode(node, input, flow.id, sessionId || "default");
      } else if (node.type === "stt") {
        output = await executeSTTNode(node, input);
      } else if (node.type === "tts") {
        output = await executeTTSNode(node, input);
      } else if (node.type === "tool" && node.data?.config?.tool_name) {
        output = await executeToolNode(supabase, node, input, flow.id, executionId);
      } else if (node.type === "sub_flow" && node.data?.config?.flow_id) {
        const depth = (metadata?.depth as number) || 0;
        const ancestors = (metadata?.ancestor_flow_ids as string[]) || [];
        output = await executeSubFlowNode(node, input, flow.id, executionId, sessionId || "default", channel, depth, ancestors);
      } else if (node.type === "vision") {
        output = await executeVisionNode(node, input, message, flow.id);
        stepCostCents = output.cost_cents || 0;
      } else {
        output = executeNodeInline(node, input, message);
      }
    } catch (err) {
      if (err instanceof HITLPauseSignal) {
        const timeoutAt = new Date(Date.now() + err.timeoutMinutes * 60000).toISOString();
        await supabase.from("agent_executions").update({
          status: "paused", is_paused: true, paused_at: new Date().toISOString(),
          pause_reason: err.pauseMessage, pause_timeout_at: timeoutAt,
          pause_fallback_action: err.fallbackAction, current_state: nodeId,
          fsm_snapshot: { channel, metadata, message, last_output: finalOutput, proposed_response: finalOutput?.response || null, steps_count: stepOrder, hitl_node_id: nodeId },
        }).eq("id", executionId);

        await supabase.from("agent_execution_steps").insert({
          execution_id: executionId, node_id: nodeId, node_type: "hitl", step_order: stepOrder,
          input_data: input, output_data: { status: "paused", timeout_minutes: err.timeoutMinutes, fallback: err.fallbackAction },
          status: "paused", started_at: new Date(stepStart).toISOString(), completed_at: new Date().toISOString(), latency_ms: Date.now() - stepStart,
        });

        return new Response(JSON.stringify({
          execution_id: executionId, status: "paused",
          hitl: { message: err.pauseMessage, timeout_at: timeoutAt, fallback: err.fallbackAction },
          steps: executionSteps, executor: "inline_fallback",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Saga Compensation
      const errorMsg = (err as Error).message;
      output = { error: errorMsg };
      stepStatus = "error";

      const sagaResult = await executeSagaCompensation(
        supabase, executionId, flow.id, completedSteps,
        nodeId, node.type, errorMsg, stepOrder,
        { channel, metadata, message }
      );
      sagaTriggered = sagaResult.sagaTriggered;
    }

    const stepDuration = Date.now() - stepStart;
    await supabase.from("agent_execution_steps").insert({
      execution_id: executionId, node_id: nodeId, node_type: node.type, step_order: stepOrder,
      input_data: input, output_data: output, status: stepStatus,
      started_at: new Date(stepStart).toISOString(), completed_at: new Date().toISOString(),
      latency_ms: stepDuration, cost_cents: stepCostCents,
    });

    executionSteps.push({ node_id: nodeId, node_type: node.type, status: stepStatus, output, duration_ms: stepDuration });
    if (stepStatus === "completed") {
      finalOutput = output;
      totalTokensIn += output?.tokens?.prompt || 0;
      totalTokensOut += output?.tokens?.completion || 0;
      totalCostCents += stepCostCents;
    }

    if (sagaTriggered) {
      queue.length = 0;
      break;
    }

    if (stepStatus === "completed") {
      completedSteps.push({ nodeId, node, output, input });
      const outEdges = edges.filter((e: any) => e.source === nodeId);
      for (const edge of outEdges) {
        if (node.type === "condition" && edge.sourceHandle && output?.branch) {
          if (edge.sourceHandle !== output.branch) continue;
        }
        if (!visited.has(edge.target)) queue.push({ nodeId: edge.target, input: output });
      }
    }
  }

  // Post-execution: Output Guards
  const flowSettings = flow.flow_definition?.settings || {};
  const flowGuardConfig: GuardConfig = flowSettings.output_guards || getDefaultGuardConfig();
  let guardedOutput = finalOutput;
  let guardInfo: any = null;

  if (flowGuardConfig.enabled && finalOutput && !sagaTriggered) {
    const textToGuard = finalOutput.response || finalOutput.text || "";
    if (textToGuard) {
      const guardResult = applyOutputGuards(textToGuard, flowGuardConfig);
      if (guardResult.was_modified || guardResult.was_blocked) {
        guardedOutput = { ...finalOutput, response: guardResult.filtered_text, text: guardResult.filtered_text };
        guardInfo = { rules_applied: guardResult.rules_applied, rules_blocked: guardResult.rules_blocked, was_blocked: guardResult.was_blocked };
        console.log(`[Gateway] Output Guards applied: ${guardResult.rules_applied.join(", ")}`);
      }
    }
  }

  // Post-execution: Eval Layer
  let evalScores: EvalScores | null = null;
  const evalEnabled = flowSettings.eval_enabled !== false;
  if (evalEnabled && !sagaTriggered && finalOutput) {
    const evalOutput = guardedOutput?.response || guardedOutput?.text || "";
    if (evalOutput && evalOutput.length > 10) {
      try {
        evalScores = await evaluateOutput(message, evalOutput, flow.id);
      } catch (err) {
        console.log(`[Gateway] Eval failed: ${(err as Error).message}`);
      }
    }
  }

  const finalStatus = sagaTriggered ? "failed" : "completed";
  await supabase.from("agent_executions").update({
    status: finalStatus, current_state: null,
    completed_at: new Date().toISOString(),
    total_latency_ms: Date.now() - executionStart,
    nodes_executed: stepOrder,
    total_tokens_in: totalTokensIn,
    total_tokens_out: totalTokensOut,
    total_cost_cents: totalCostCents,
    quality_score: evalScores?.aggregate || null,
    eval_details: evalScores ? { relevance: evalScores.relevance, completeness: evalScores.completeness, safety: evalScores.safety, hallucination: evalScores.hallucination, aggregate: evalScores.aggregate, reasoning: evalScores.reasoning, model_used: evalScores.model_used } : null,
    fsm_snapshot: {
      channel, metadata, message, final_output: guardedOutput, steps_count: stepOrder,
      saga_triggered: sagaTriggered, output_guards: guardInfo,
      canary: canaryDecision.is_canary ? { version: canaryDecision.version_id, percent: canaryDecision.percent } : null,
      eval_scores: evalScores ? { relevance: evalScores.relevance, completeness: evalScores.completeness, safety: evalScores.safety, hallucination: evalScores.hallucination, aggregate: evalScores.aggregate, reasoning: evalScores.reasoning, model_used: evalScores.model_used } : null,
    },
  }).eq("id", executionId);

  return new Response(JSON.stringify({
    execution_id: executionId, status: finalStatus, output: guardedOutput,
    steps: executionSteps, steps_count: stepOrder, saga_triggered: sagaTriggered,
    output_guards: guardInfo,
    canary: { is_canary: canaryDecision.is_canary, reason: canaryDecision.reason },
    eval_scores: evalScores ? { relevance: evalScores.relevance, completeness: evalScores.completeness, safety: evalScores.safety, hallucination: evalScores.hallucination, aggregate: evalScores.aggregate } : null,
    executor: "inline_fallback",
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
