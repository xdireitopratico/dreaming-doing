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
import { type CanaryConfig } from "../_shared/canary-router.ts";
import { corsHeaders, handleHealthCheck } from "../_shared/gateway-core.ts";
import {
  buildCanaryDecision,
  executeGatewayBfsStep,
  finalizeGatewayExecution,
  initGatewayBfsState,
  runGatewayBfsInline,
  type GatewayBfsState,
  type GatewayFlowContext,
} from "../_shared/gateway-bfs.ts";
import { sendGatewayInngestEvent } from "../_shared/gateway-inngest.ts";
import { executeTool } from "../_shared/tool-executor.ts";
import {
  classifyToolHealthResult,
  getToolHealthPayload,
} from "../_shared/tool-health-payloads.ts";
import { handleWhatsAppIncoming, handleWhatsAppSend } from "../_shared/gateway-whatsapp.ts";
import { handleVoicePipeline, handleDirectTTS } from "../_shared/gateway-voice.ts";
import { handleDLQRetry, handleHITLDecide } from "../_shared/gateway-saga.ts";

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
      case "test_tool":     return await testTool(body);
      case "execute_step":  return await executeFlowStep(body);
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

  // Test mode: inline BFS (fast smoke)
  return await executeFlowInternal(supabase, {
    flow,
    flowDef,
    deploymentId: null,
    message,
    sessionId: session_id || crypto.randomUUID(),
    channel,
    metadata: { ...metadata, test_mode: true },
    canaryConfig: null,
    forceInline: true,
  });
}

// ═══════════════════════════════════════════════════════════
// testTool — Lightweight tool health check (editor SecretsPanel)
// ═══════════════════════════════════════════════════════════

async function testTool(body: any): Promise<Response> {
  const flowId = body?.flow_id as string | undefined;
  const toolName = body?.tool_name as string | undefined;
  if (!flowId || !toolName) {
    return new Response(JSON.stringify({ error: "flow_id and tool_name are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const toolInput = (body?.tool_input as Record<string, unknown> | undefined)
    || getToolHealthPayload(toolName);

  const result = await executeTool({
    tool_name: toolName,
    input_data: toolInput,
    execution_id: crypto.randomUUID(),
    tenant_id: flowId,
    timeout_ms: Number(body?.timeout_ms) || 45000,
  });

  const health = classifyToolHealthResult(toolName, result);

  return new Response(JSON.stringify({
    tool_name: toolName,
    health,
    status: result.status,
    error: result.error || null,
    result: result.result,
    duration_ms: result.duration_ms,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
  forceInline?: boolean;
}

function buildFlowContext(params: FlowExecParams): GatewayFlowContext {
  return {
    flow: params.flow,
    flowDef: params.flowDef,
    deploymentId: params.deploymentId,
    message: params.message,
    sessionId: params.sessionId,
    channel: params.channel,
    metadata: params.metadata,
    canaryConfig: params.canaryConfig,
    testMode: !!params.metadata?.test_mode,
  };
}

async function createOrResumeExecution(
  supabase: any,
  params: FlowExecParams,
  triggerNode: any,
  bfsState?: GatewayBfsState,
): Promise<{ executionId: string; isNew: boolean } | Response> {
  const { flow, deploymentId, sessionId, channel, metadata, message } = params;
  const nodes = params.flowDef?.nodes || [];

  const { data: existing } = await supabase
    .from("agent_executions")
    .select("id, status, fsm_snapshot")
    .eq("session_id", sessionId)
    .eq("flow_id", flow.id)
    .in("status", ["running", "paused", "queued"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { executionId: existing.id, isNew: false };
  }

  const snapshot = {
    channel,
    metadata,
    message,
    variables: {},
    ...(bfsState ? { bfs: bfsState } : {}),
  };

  const { data: newExec, error: execErr } = await supabase
    .from("agent_executions")
    .insert({
      flow_id: flow.id,
      deployment_id: deploymentId,
      session_id: sessionId,
      status: bfsState ? "queued" : "running",
      current_state: triggerNode?.id || nodes.find((n: any) => n.type === "trigger")?.id || null,
      fsm_snapshot: snapshot,
    })
    .select("id")
    .single();

  if (execErr || !newExec) {
    return new Response(JSON.stringify({ error: "Failed to create execution" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return { executionId: newExec.id, isNew: true };
}

function buildGatewayResponse(
  executionId: string,
  state: GatewayBfsState,
  ctx: GatewayFlowContext,
  canaryDecision: ReturnType<typeof buildCanaryDecision>,
  executor: string,
  extra?: Record<string, unknown>,
  statusCode = 200,
) {
  const finalStatus = state.paused ? "paused" : (state.sagaTriggered ? "failed" : (state.done ? "completed" : "running"));
  return new Response(JSON.stringify({
    execution_id: executionId,
    status: finalStatus,
    output: state.finalOutput,
    steps: state.executionSteps,
    steps_count: state.stepOrder,
    saga_triggered: state.sagaTriggered,
    canary: { is_canary: canaryDecision.is_canary, reason: canaryDecision.reason },
    executor,
    ...(state.pausePayload || {}),
    ...extra,
  }), { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function executeFlowInternal(supabase: any, params: FlowExecParams): Promise<Response> {
  const nodes = params.flowDef?.nodes || [];
  const triggerNode = nodes.find((n: any) => n.type === "trigger");
  if (!triggerNode) {
    return new Response(JSON.stringify({ error: "Flow has no trigger node" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const canaryDecision = buildCanaryDecision(params.sessionId, params.canaryConfig);
  const ctx = buildFlowContext(params);
  const initialState = initGatewayBfsState(
    nodes,
    triggerNode,
    params.message,
    params.channel,
    params.metadata,
  );

  const useInngest = !params.forceInline
    && !params.metadata?.test_mode
    && params.deploymentId != null;

  const created = await createOrResumeExecution(
    supabase,
    params,
    triggerNode,
    useInngest ? initialState : undefined,
  );
  if (created instanceof Response) return created;

  if (useInngest && !created.isNew) {
    const { data: existingExec } = await supabase
      .from("agent_executions")
      .select("status, fsm_snapshot")
      .eq("id", created.executionId)
      .single();

    const snapshot = (existingExec?.fsm_snapshot || {}) as Record<string, unknown>;
    const existingBfs = (snapshot.bfs as GatewayBfsState | undefined) || { ...initialState, done: false };
    return buildGatewayResponse(
      created.executionId,
      existingBfs,
      ctx,
      canaryDecision,
      existingExec?.status === "queued" ? "inngest_queued" : "inngest_running",
      { resumed: true },
      existingExec?.status === "queued" ? 202 : 200,
    );
  }

  if (useInngest) {
    const inngestResult = await sendGatewayInngestEvent({
      execution_id: created.executionId,
      flow_id: params.flow.id,
      deployment_id: params.deploymentId,
      message: params.message,
      session_id: params.sessionId,
      channel: params.channel,
      metadata: params.metadata,
    });

    if (inngestResult.ok) {
      return buildGatewayResponse(
        created.executionId,
        { ...initialState, done: false },
        ctx,
        canaryDecision,
        "inngest_queued",
        { inngest_event_ids: inngestResult.ids },
        202,
      );
    }

    console.warn("[Gateway] Inngest enqueue failed, falling back to inline:", inngestResult.error);
    await supabase.from("agent_executions").update({ status: "running" }).eq("id", created.executionId);
  }

  const executionStart = Date.now();
  const state = await runGatewayBfsInline(
    supabase,
    created.executionId,
    ctx,
    initialState,
    canaryDecision,
    executionStart,
  );

  const executor = useInngest ? "inline_fallback" : "inline";
  return buildGatewayResponse(created.executionId, state, ctx, canaryDecision, executor);
}

async function executeFlowStep(body: any): Promise<Response> {
  const supabase = getSupabaseClient();
  const executionId = body?.execution_id as string;
  if (!executionId) {
    return new Response(JSON.stringify({ error: "execution_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: execution, error: execErr } = await supabase
    .from("agent_executions")
    .select("id, flow_id, deployment_id, session_id, status, fsm_snapshot")
    .eq("id", executionId)
    .single();

  if (execErr || !execution) {
    return new Response(JSON.stringify({ error: "Execution not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: flow, error: flowErr } = await supabase
    .from("agent_flows")
    .select("id, name, flow_definition, status")
    .eq("id", execution.flow_id)
    .single();

  if (flowErr || !flow) {
    return new Response(JSON.stringify({ error: "Flow not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const snapshot = (execution.fsm_snapshot || {}) as Record<string, any>;
  const flowDef = flow.flow_definition as { nodes?: any[]; edges?: any[] };
  const nodes = flowDef?.nodes || [];
  const triggerNode = nodes.find((n: any) => n.type === "trigger");
  if (!triggerNode) {
    return new Response(JSON.stringify({ error: "Flow has no trigger node" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let state = snapshot.bfs as GatewayBfsState | undefined;
  if (!state) {
    state = initGatewayBfsState(
      nodes,
      triggerNode,
      snapshot.message || body.message || "",
      snapshot.channel || "web",
      snapshot.metadata || {},
    );
  }

  const ctx: GatewayFlowContext = {
    flow,
    flowDef,
    deploymentId: execution.deployment_id,
    message: snapshot.message || body.message || "",
    sessionId: execution.session_id,
    channel: snapshot.channel || "web",
    metadata: snapshot.metadata || {},
    canaryConfig: null,
    testMode: false,
  };

  const canaryDecision = buildCanaryDecision(ctx.sessionId, null);
  const executionStart = Date.now();

  await supabase.from("agent_executions").update({ status: "running" }).eq("id", executionId);
  state = await executeGatewayBfsStep(supabase, executionId, ctx, state);

  if (state.done && !state.paused) {
    const finalized = await finalizeGatewayExecution(
      supabase,
      executionId,
      ctx,
      state,
      executionStart,
      canaryDecision,
    );
    state.finalOutput = finalized.guardedOutput;
  } else if (!state.paused) {
    await supabase.from("agent_executions").update({
      status: "running",
      fsm_snapshot: { ...snapshot, bfs: state, message: ctx.message, channel: ctx.channel, metadata: ctx.metadata },
    }).eq("id", executionId);
  }

  return buildGatewayResponse(executionId, state, ctx, canaryDecision, "inngest_step");
}
