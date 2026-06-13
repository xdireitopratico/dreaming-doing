/**
 * AetherForge Gateway — Saga Compensation + DLQ Handlers
 * Extracted from monolithic index.ts (Round 44.5 refactoring)
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "./gateway-core.ts";
import { executeTool } from "./tool-executor.ts";

/**
 * Resolve compensation input mapping from completed step output
 * Supports JSONPath-like notation: $.output.field_name
 */
export function resolveCompensationInput(
  mapping: Record<string, string> | undefined,
  output: any
): Record<string, any> {
  if (!mapping) return {};
  const resolved: Record<string, any> = {};
  for (const [targetKey, sourcePath] of Object.entries(mapping)) {
    if (sourcePath.startsWith("$.output.")) {
      const field = sourcePath.replace("$.output.", "");
      resolved[targetKey] = output?.[field];
    } else if (sourcePath.startsWith("$.")) {
      const field = sourcePath.replace("$.", "");
      resolved[targetKey] = output?.[field];
    } else {
      resolved[targetKey] = sourcePath; // literal value
    }
  }
  return resolved;
}

/**
 * Execute saga compensation for completed steps in reverse order
 */
export async function executeSagaCompensation(
  supabase: any,
  executionId: string,
  flowId: string,
  completedSteps: { nodeId: string; node: any; output: any; input: any }[],
  failedNodeId: string,
  failedNodeType: string,
  errorMsg: string,
  stepOrder: number,
  context: { channel: string; metadata: any; message: string }
): Promise<{ compensationResults: any[]; sagaTriggered: boolean }> {
  console.log(`[Gateway/Saga] Node ${failedNodeId} (${failedNodeType}) FAILED: ${errorMsg}`);
  console.log(`[Gateway/Saga] Initiating compensation for ${completedSteps.length} completed steps...`);

  const compensationResults: any[] = [];

  for (let i = completedSteps.length - 1; i >= 0; i--) {
    const completedStep = completedSteps[i];
    const compensation = completedStep.node.data?.config?.compensation;
    
    if (!compensation) {
      console.log(`[Gateway/Saga] Step ${completedStep.nodeId} (${completedStep.node.type}): no compensation defined, skipping`);
      continue;
    }

    console.log(`[Gateway/Saga] Compensating step ${completedStep.nodeId}: ${compensation.tool_name || compensation.action || "custom"}`);
    const compStart = Date.now();
    let compOutput: any;
    let compStatus = "compensated";

    try {
      if (compensation.tool_name) {
        const compInput = resolveCompensationInput(compensation.input_mapping, completedStep.output);
        compOutput = await executeTool({
          tool_name: compensation.tool_name,
          input_data: compInput,
          execution_id: executionId,
          tenant_id: flowId,
          timeout_ms: compensation.timeout_ms || 30000,
        });
      } else if (compensation.action === "delete" && compensation.table) {
        const deleteKey = resolveCompensationInput(compensation.input_mapping, completedStep.output);
        const { error: delErr } = await supabase
          .from(compensation.table)
          .delete()
          .match(deleteKey);
        compOutput = { deleted: !delErr, table: compensation.table, error: delErr?.message };
      } else {
        compOutput = { action: "noop", reason: "unknown compensation type" };
      }
    } catch (compErr) {
      compStatus = "compensation_failed";
      compOutput = { error: (compErr as Error).message };
      console.error(`[Gateway/Saga] Compensation FAILED for ${completedStep.nodeId}:`, compErr);
    }

    compensationResults.push({
      node_id: completedStep.nodeId,
      node_type: completedStep.node.type,
      status: compStatus,
      output: compOutput,
    });

    await supabase.from("agent_execution_steps").insert({
      execution_id: executionId,
      node_id: completedStep.nodeId,
      node_type: completedStep.node.type,
      step_order: stepOrder + compensationResults.length,
      input_data: { compensation: true, original_output: completedStep.output },
      output_data: compOutput,
      status: compStatus,
      started_at: new Date(compStart).toISOString(),
      completed_at: new Date().toISOString(),
      latency_ms: Date.now() - compStart,
    });
  }

  const sagaTriggered = compensationResults.length > 0;

  // Send to DLQ
  await supabase.from("execution_dead_letter_queue").insert({
    execution_id: executionId,
    step_id: null,
    node_type: failedNodeType,
    error_code: `SAGA_${failedNodeType?.toUpperCase() || "UNKNOWN"}_FAILED`,
    error_message: errorMsg,
    input_data: {},
    node_config: null,
    fsm_snapshot: {
      ...context,
      failed_node: failedNodeId,
      completed_steps: completedSteps.map(s => s.nodeId),
      compensation_results: compensationResults,
      saga_triggered: sagaTriggered,
    },
    retry_count: 0,
    resolution_status: "pending",
  });

  console.log(`[Gateway/Saga] Compensation complete. ${compensationResults.length} steps compensated, entry added to DLQ.`);

  return { compensationResults, sagaTriggered };
}

/**
 * Handle DLQ retry — re-execute the failed flow via the gateway itself
 */
export async function handleDLQRetry(body: any): Promise<Response> {
  const { dlq_id } = body;

  if (!dlq_id) {
    return new Response(JSON.stringify({ error: "dlq_id is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Load DLQ entry
    const { data: dlqEntry, error: dlqErr } = await supabase
      .from("execution_dead_letter_queue")
      .select("*")
      .eq("id", dlq_id)
      .single();

    if (dlqErr || !dlqEntry) {
      return new Response(JSON.stringify({ error: "DLQ entry not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((dlqEntry as any).retry_count >= 3) {
      return new Response(JSON.stringify({ error: "Max retries (3) reached", dlq_id }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Load original execution to get flow context
    const executionId = (dlqEntry as any).execution_id;
    const { data: execution } = await supabase
      .from("agent_executions")
      .select("flow_id, deployment_id, input_message, session_id, state_snapshot")
      .eq("id", executionId)
      .single();

    if (!execution) {
      return new Response(JSON.stringify({ error: "Original execution not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Find deployment slug for re-execution
    const { data: deployment } = await supabase
      .from("agent_deployments")
      .select("endpoint_slug")
      .eq("id", (execution as any).deployment_id)
      .single();

    if (!deployment || !(deployment as any).endpoint_slug) {
      return new Response(JSON.stringify({ error: "Deployment not found for re-execution" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Mark DLQ as retrying
    await supabase
      .from("execution_dead_letter_queue")
      .update({
        retry_count: ((dlqEntry as any).retry_count || 0) + 1,
        resolution_status: "retrying",
      })
      .eq("id", dlq_id);

    // 5. Re-execute by calling the gateway itself (self-invoke)
    const snapshot = (execution as any).state_snapshot || {};
    const reExecResponse = await fetch(`${supabaseUrl}/functions/v1/aetherforge-gateway`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        slug: (deployment as any).endpoint_slug,
        message: (execution as any).input_message || snapshot.message || "retry",
        channel: snapshot.channel || "dlq_retry",
        metadata: { ...snapshot.metadata, dlq_retry: true, dlq_id, original_execution_id: executionId },
      }),
    });

    const reExecResult = await reExecResponse.json();

    // 6. Update DLQ based on result
    const newStatus = reExecResult.status === "completed" ? "resolved" : "retry_failed";
    await supabase
      .from("execution_dead_letter_queue")
      .update({
        resolution_status: newStatus,
        resolved_at: newStatus === "resolved" ? new Date().toISOString() : null,
        resolution_notes: `Re-executed as ${reExecResult.execution_id || "unknown"}`,
      })
      .eq("id", dlq_id);

    console.log(`[Gateway/DLQ] Retry ${dlq_id}: ${newStatus} → new execution ${reExecResult.execution_id}`);

    return new Response(JSON.stringify({
      status: newStatus,
      dlq_id,
      original_execution_id: executionId,
      new_execution_id: reExecResult.execution_id,
      retry_count: ((dlqEntry as any).retry_count || 0) + 1,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Mark as retry_failed on exception
    await supabase
      .from("execution_dead_letter_queue")
      .update({ resolution_status: "retry_failed" } as any)
      .eq("id", dlq_id);

    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

/**
 * Handle HITL decision — resume paused execution
 */
export async function handleHITLDecide(body: any): Promise<Response> {
  const { execution_id, decision } = body;
  if (!execution_id || !decision?.action) {
    return new Response(JSON.stringify({ error: "execution_id and decision.action required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: exec, error } = await supabase
    .from("agent_executions")
    .select("id, flow_id, status, is_paused, fsm_snapshot, current_state")
    .eq("id", execution_id)
    .single();

  if (error || !exec) {
    return new Response(JSON.stringify({ error: "Execution not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!exec.is_paused) {
    return new Response(JSON.stringify({ error: "Execution is not paused" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const snapshot = (exec.fsm_snapshot as Record<string, any>) || {};
  const updateData: Record<string, any> = {
    is_paused: false,
    paused_at: null,
    pause_reason: null,
    pause_timeout_at: null,
    pause_fallback_action: null,
    fsm_snapshot: {
      ...snapshot,
      hitl_decision: {
        action: decision.action,
        modified_response: decision.modified_response || null,
        decided_by: decision.decided_by || "unknown",
        decided_at: new Date().toISOString(),
      },
    },
  };

  if (decision.action === "rejected") {
    updateData.status = "failed";
    updateData.error_message = "HITL: Rejected by reviewer";
  } else {
    updateData.status = "completed";
  }

  const { error: updateErr } = await supabase
    .from("agent_executions")
    .update(updateData)
    .eq("id", execution_id);

  if (updateErr) {
    return new Response(JSON.stringify({ error: "Failed to update execution", detail: updateErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabase.from("agent_execution_steps").insert({
    execution_id,
    node_id: exec.current_state || "hitl",
    node_type: "hitl",
    step_order: 999,
    input_data: { decision },
    output_data: { action: decision.action, modified_response: decision.modified_response },
    status: decision.action === "rejected" ? "error" : "completed",
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    latency_ms: 0,
  });

  return new Response(JSON.stringify({
    execution_id,
    action: decision.action,
    status: updateData.status,
  }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
