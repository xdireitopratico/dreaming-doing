/**
 * Gateway BFS execution engine — inline (test) and step-by-step (Inngest)
 */
import { cacheLookup, cacheSave } from "./semantic-cache.ts";
import { applyOutputGuards, getDefaultGuardConfig, type GuardConfig } from "./output-guards.ts";
import { evaluateOutput, type EvalScores } from "./eval-layer.ts";
import { routeCanary, type CanaryConfig } from "./canary-router.ts";
import {
  HITLPauseSignal,
  executeLLMNode,
  executeNodeInline,
  executeToolNode,
  executeMemoryNode,
  executeSubFlowNode,
  executeVisionNode,
} from "./gateway-core.ts";
import { executeSTTNode, executeTTSNode } from "./gateway-voice.ts";
import { executeSagaCompensation } from "./gateway-saga.ts";
import {
  executeRagSearchNode,
  executeDelayNode,
  executeTransformerNode,
  executeLoopNode,
  executeErrorHandlerNode,
  executeSwitchNode,
} from "./executor-data.ts";

export interface GatewayFlowContext {
  flow: { id: string; name: string; flow_definition: any; status: string };
  flowDef: {
    nodes?: any[];
    edges?: any[];
    settings?: Record<string, unknown>;
    briefing?: Record<string, unknown>;
  };
  deploymentId: string | null;
  message: string;
  sessionId: string;
  channel: string;
  metadata: Record<string, any>;
  canaryConfig: CanaryConfig | null;
  testMode?: boolean;
}

export interface GatewayBfsState {
  queue: Array<{ nodeId: string; input: any }>;
  visited: string[];
  loopCounters: Record<string, number>;
  completedSteps: Array<{ nodeId: string; node: any; output: any; input: any }>;
  executionSteps: any[];
  stepOrder: number;
  finalOutput: any;
  sagaTriggered: boolean;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostCents: number;
  done: boolean;
  paused?: boolean;
  pausePayload?: Record<string, unknown>;
}

export function initGatewayBfsState(
  nodes: any[],
  triggerNode: any,
  message: string,
  channel: string,
  metadata: Record<string, any>,
): GatewayBfsState {
  return {
    queue: [{ nodeId: triggerNode.id, input: { message, channel, metadata } }],
    visited: [],
    loopCounters: {},
    completedSteps: [],
    executionSteps: [],
    stepOrder: 0,
    finalOutput: null,
    sagaTriggered: false,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalCostCents: 0,
    done: false,
  };
}

function getLoopCounters(state: GatewayBfsState): Map<string, number> {
  return new Map(Object.entries(state.loopCounters));
}

function persistLoopCounters(map: Map<string, number>, state: GatewayBfsState) {
  state.loopCounters = Object.fromEntries(map.entries());
}

async function executeGatewayNode(
  supabase: any,
  node: any,
  input: any,
  ctx: GatewayFlowContext,
  executionId: string,
  loopCounters: Map<string, number>,
): Promise<{ output: any; stepCostCents: number }> {
  const { flow, message, sessionId, channel, metadata, testMode } = ctx;
  let output: any;
  let stepCostCents = 0;

  if (node.type === "llm") {
    const cacheEnabled = flow.flow_definition?.settings?.semantic_cache !== false;
    if (cacheEnabled) {
      const cacheResult = await cacheLookup(flow.id, input.message || input.response || message);
      if (cacheResult.hit && cacheResult.cached_response) {
        output = {
          response: cacheResult.cached_response,
          model: "cache",
          provider: "semantic_cache",
          tokens: { prompt: 0, completion: 0, total: 0 },
          cost_cents: 0,
          cache_hit: true,
          cache_similarity: cacheResult.similarity,
        };
      }
    }
    if (!output) {
      output = await executeLLMNode(node, input, message, flow.id);
      stepCostCents = output.cost_cents || 0;
      if (cacheEnabled && output.response && !output.error) {
        const inputText = input.message || input.response || message;
        const hashBuffer = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(inputText),
        );
        const inputHash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        cacheSave({
          flow_id: flow.id,
          input_text: inputText,
          input_hash: inputHash,
          response_text: output.response,
          model_id: output.model || "",
          tokens_saved: output.tokens?.total || 0,
          cost_saved_cents: output.cost_cents || 0,
        }).catch((err) => {
          console.warn("[gateway-bfs] cacheSave failed:", (err as Error).message);
        });
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
    output = await executeSubFlowNode(
      node,
      input,
      flow.id,
      executionId,
      sessionId || "default",
      channel,
      depth,
      ancestors,
    );
  } else if (node.type === "vision") {
    output = await executeVisionNode(node, input, message, flow.id);
    stepCostCents = output.cost_cents || 0;
  } else if (node.type === "rag_search") {
    output = await executeRagSearchNode(node, input, flow.id, executionId, message);
  } else if (node.type === "delay") {
    output = await executeDelayNode(node, input, !!testMode);
  } else if (node.type === "transformer") {
    output = executeTransformerNode(node, input, message);
  } else if (node.type === "loop") {
    output = executeLoopNode(node, input, loopCounters);
  } else if (node.type === "error_handler") {
    output = executeErrorHandlerNode(node, input);
  } else if (node.type === "switch") {
    output = executeSwitchNode(node, input);
  } else {
    output = executeNodeInline(node, input, message);
  }

  return { output, stepCostCents };
}

function enqueueNextNodes(
  node: any,
  nodeId: string,
  output: any,
  edges: any[],
  state: GatewayBfsState,
): void {
  const outEdges = edges.filter((e: any) => e.source === nodeId);

  if (node.type === "condition" && output?.branch) {
    for (const edge of outEdges) {
      if (edge.sourceHandle && edge.sourceHandle !== output.branch) continue;
      if (!state.visited.includes(edge.target)) {
        state.queue.push({ nodeId: edge.target, input: output });
      }
    }
    return;
  }

  if (node.type === "switch" && output?.branch) {
    for (const edge of outEdges) {
      if (edge.sourceHandle && edge.sourceHandle !== output.branch) continue;
      if (!state.visited.includes(edge.target)) {
        state.queue.push({ nodeId: edge.target, input: output });
      }
    }
    return;
  }

  if (node.type === "loop") {
    const doneEdges = outEdges.filter(
      (e: any) => e.sourceHandle === "done" || e.sourceHandle === "exit",
    );
    const bodyEdges = outEdges.filter(
      (e: any) => e.sourceHandle !== "done" && e.sourceHandle !== "exit",
    );

    if (output.completed) {
      const targets = doneEdges.length ? doneEdges : outEdges;
      for (const edge of targets) {
        if (!state.visited.includes(edge.target)) {
          state.queue.push({ nodeId: edge.target, input: output });
        }
      }
      delete state.loopCounters[nodeId];
      return;
    }

    const targets = bodyEdges.length ? bodyEdges : outEdges.slice(0, 1);
    for (const edge of targets) {
      state.visited = state.visited.filter((id) => id !== edge.target);
      state.queue.push({ nodeId: edge.target, input: output });
    }
    return;
  }

  for (const edge of outEdges) {
    if (!state.visited.includes(edge.target)) {
      state.queue.push({ nodeId: edge.target, input: output });
    }
  }
}

export async function executeGatewayBfsStep(
  supabase: any,
  executionId: string,
  ctx: GatewayFlowContext,
  state: GatewayBfsState,
): Promise<GatewayBfsState> {
  if (state.done || state.paused || state.queue.length === 0) {
    state.done = state.queue.length === 0 && !state.paused;
    return state;
  }

  const nodes = ctx.flowDef?.nodes || [];
  const edges = ctx.flowDef?.edges || [];
  const loopCounters = getLoopCounters(state);

  const { nodeId, input } = state.queue.shift()!;
  if (state.visited.includes(nodeId) && !state.loopCounters[nodeId]) {
    state.done = state.queue.length === 0;
    return state;
  }
  if (!state.visited.includes(nodeId)) state.visited.push(nodeId);

  const node = nodes.find((n: any) => n.id === nodeId);
  if (!node) {
    state.done = state.queue.length === 0;
    return state;
  }

  state.stepOrder++;
  const stepStart = Date.now();
  await supabase.from("agent_executions").update({ current_state: nodeId }).eq("id", executionId);

  let output: any;
  let stepStatus = "completed";
  let stepCostCents = 0;

  try {
    const result = await executeGatewayNode(supabase, node, input, ctx, executionId, loopCounters);
    output = result.output;
    stepCostCents = result.stepCostCents;
    persistLoopCounters(loopCounters, state);
  } catch (err) {
    if (err instanceof HITLPauseSignal) {
      const timeoutAt = new Date(Date.now() + err.timeoutMinutes * 60000).toISOString();
      state.paused = true;
      state.done = true;
      state.pausePayload = {
        hitl: { message: err.pauseMessage, timeout_at: timeoutAt, fallback: err.fallbackAction },
        node_id: nodeId,
        step_order: state.stepOrder,
      };
      await supabase
        .from("agent_executions")
        .update({
          status: "paused",
          is_paused: true,
          paused_at: new Date().toISOString(),
          pause_reason: err.pauseMessage,
          pause_timeout_at: timeoutAt,
          pause_fallback_action: err.fallbackAction,
          current_state: nodeId,
          fsm_snapshot: {
            channel: ctx.channel,
            metadata: ctx.metadata,
            message: ctx.message,
            bfs: state,
            last_output: state.finalOutput,
            proposed_response: state.finalOutput?.response || null,
            steps_count: state.stepOrder,
            hitl_node_id: nodeId,
          },
        })
        .eq("id", executionId);

      const { error: hitlStepErr } = await supabase.from("agent_execution_steps").insert({
        execution_id: executionId,
        node_id: nodeId,
        node_type: "hitl",
        step_order: state.stepOrder,
        input_data: input,
        output_data: {
          status: "paused",
          timeout_minutes: err.timeoutMinutes,
          fallback: err.fallbackAction,
        },
        status: "paused",
        started_at: new Date(stepStart).toISOString(),
        completed_at: new Date().toISOString(),
        latency_ms: Date.now() - stepStart,
      });
      if (hitlStepErr) console.error("[gateway-bfs] hitl step insert failed:", hitlStepErr.message);
      return state;
    }

    const errorMsg = (err as Error).message;
    output = { error: errorMsg };
    stepStatus = "error";

    const sagaResult = await executeSagaCompensation(
      supabase,
      executionId,
      ctx.flow.id,
      state.completedSteps,
      nodeId,
      node.type,
      errorMsg,
      state.stepOrder,
      { channel: ctx.channel, metadata: ctx.metadata, message: ctx.message },
    );
    state.sagaTriggered = sagaResult.sagaTriggered;
  }

  const stepDuration = Date.now() - stepStart;
  const { error: stepErr } = await supabase.from("agent_execution_steps").insert({
    execution_id: executionId,
    node_id: nodeId,
    node_type: node.type,
    step_order: state.stepOrder,
    input_data: input,
    output_data: output,
    status: stepStatus,
    started_at: new Date(stepStart).toISOString(),
    completed_at: new Date().toISOString(),
    latency_ms: stepDuration,
    cost_cents: stepCostCents,
    ...(node.type === "tool" && output?.tool_name ? { tool_name: output.tool_name } : {}),
    ...(node.type === "tool" && output?.idempotency_key
      ? { tool_idempotency_key: output.idempotency_key }
      : {}),
  });
  if (stepErr)
    console.error("[gateway-bfs] step insert failed:", stepErr.message, {
      nodeId,
      nodeType: node.type,
    });

  state.executionSteps.push({
    node_id: nodeId,
    node_type: node.type,
    status: stepStatus,
    output,
    duration_ms: stepDuration,
  });

  if (stepStatus === "completed") {
    state.finalOutput = output;
    state.totalTokensIn += output?.tokens?.prompt || 0;
    state.totalTokensOut += output?.tokens?.completion || 0;
    state.totalCostCents += stepCostCents;
    state.completedSteps.push({ nodeId, node, output, input });
    enqueueNextNodes(node, nodeId, output, edges, state);
  }

  if (state.sagaTriggered) {
    state.queue = [];
  }

  state.done = state.queue.length === 0 && !state.paused;
  return state;
}

export async function finalizeGatewayExecution(
  supabase: any,
  executionId: string,
  ctx: GatewayFlowContext,
  state: GatewayBfsState,
  executionStart: number,
  canaryDecision: {
    is_canary: boolean;
    version_id: string | null;
    reason: string;
    percent: number;
  },
): Promise<{
  finalStatus: string;
  guardedOutput: any;
  guardInfo: any;
  evalScores: EvalScores | null;
}> {
  const flowSettings = ctx.flow.flow_definition?.settings || {};
  const flowGuardConfig: GuardConfig = flowSettings.output_guards || getDefaultGuardConfig();
  let guardedOutput = state.finalOutput;
  let guardInfo: any = null;

  if (flowGuardConfig.enabled && state.finalOutput && !state.sagaTriggered) {
    const textToGuard =
      state.finalOutput.response || state.finalOutput.text || state.finalOutput.transformed || "";
    if (textToGuard) {
      const guardResult = applyOutputGuards(textToGuard, flowGuardConfig);
      if (guardResult.was_modified || guardResult.was_blocked) {
        guardedOutput = {
          ...state.finalOutput,
          response: guardResult.filtered_text,
          text: guardResult.filtered_text,
        };
        guardInfo = {
          rules_applied: guardResult.rules_applied,
          rules_blocked: guardResult.rules_blocked,
          was_blocked: guardResult.was_blocked,
        };
      }
    }
  }

  let evalScores: EvalScores | null = null;
  const evalEnabled = flowSettings.eval_enabled !== false;
  if (evalEnabled && !state.sagaTriggered && state.finalOutput) {
    const evalOutput =
      guardedOutput?.response || guardedOutput?.text || guardedOutput?.transformed || "";
    if (evalOutput && evalOutput.length > 10) {
      try {
        const evalModelId =
          flowSettings.eval_model_id ||
          ctx.flowDef?.briefing?.quality_model ||
          "google/gemini-2.5-flash";
        evalScores = await evaluateOutput(ctx.message, evalOutput, ctx.flow.id, evalModelId);
      } catch (err) {
        console.log(`[Gateway] Eval failed: ${(err as Error).message}`);
      }
    }
  }

  const finalStatus = state.paused ? "paused" : state.sagaTriggered ? "failed" : "completed";

  await supabase
    .from("agent_executions")
    .update({
      status: finalStatus,
      current_state: null,
      completed_at: state.paused ? null : new Date().toISOString(),
      total_latency_ms: Date.now() - executionStart,
      nodes_executed: state.stepOrder,
      total_tokens_in: state.totalTokensIn,
      total_tokens_out: state.totalTokensOut,
      total_cost_cents: state.totalCostCents,
      quality_score: evalScores?.aggregate || null,
      eval_details: evalScores
        ? {
            relevance: evalScores.relevance,
            completeness: evalScores.completeness,
            safety: evalScores.safety,
            hallucination: evalScores.hallucination,
            aggregate: evalScores.aggregate,
            reasoning: evalScores.reasoning,
            model_used: evalScores.model_used,
          }
        : null,
      fsm_snapshot: {
        channel: ctx.channel,
        metadata: ctx.metadata,
        message: ctx.message,
        final_output: guardedOutput,
        steps_count: state.stepOrder,
        saga_triggered: state.sagaTriggered,
        output_guards: guardInfo,
        bfs: state,
        canary: canaryDecision.is_canary
          ? { version: canaryDecision.version_id, percent: canaryDecision.percent }
          : null,
        eval_scores: evalScores
          ? {
              relevance: evalScores.relevance,
              completeness: evalScores.completeness,
              safety: evalScores.safety,
              hallucination: evalScores.hallucination,
              aggregate: evalScores.aggregate,
              reasoning: evalScores.reasoning,
              model_used: evalScores.model_used,
            }
          : null,
      },
    })
    .eq("id", executionId);

  return { finalStatus, guardedOutput, guardInfo, evalScores };
}

export async function runGatewayBfsInline(
  supabase: any,
  executionId: string,
  ctx: GatewayFlowContext,
  initialState: GatewayBfsState,
  canaryDecision: {
    is_canary: boolean;
    version_id: string | null;
    reason: string;
    percent: number;
  },
  executionStart: number,
): Promise<GatewayBfsState> {
  let state = initialState;
  while (!state.done && state.queue.length > 0) {
    state = await executeGatewayBfsStep(supabase, executionId, ctx, state);
  }

  if (!state.paused) {
    await finalizeGatewayExecution(
      supabase,
      executionId,
      ctx,
      state,
      executionStart,
      canaryDecision,
    );
  }

  return state;
}

export function buildCanaryDecision(sessionId: string, canaryConfig: CanaryConfig | null) {
  let canaryDecision = {
    is_canary: false,
    version_id: null as string | null,
    reason: "no_canary",
    percent: 0,
  };
  if (canaryConfig && canaryConfig.canary_percent > 0) {
    canaryDecision = routeCanary(sessionId, canaryConfig);
  }
  return canaryDecision;
}
