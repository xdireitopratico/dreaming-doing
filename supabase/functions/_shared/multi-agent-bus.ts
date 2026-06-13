/**
 * AetherForge — Multi-Agent Bus (R49)
 * Handles sub-flow invocation with depth limiting and cycle detection.
 * Max: 150 lines
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_DEPTH = 10;

export interface SubFlowRequest {
  parent_execution_id: string;
  parent_flow_id: string;
  child_flow_id: string;
  input_data: Record<string, unknown>;
  session_id: string;
  channel: string;
  depth: number;
  ancestor_flow_ids: string[];
}

export interface SubFlowResult {
  success: boolean;
  child_execution_id: string | null;
  output: unknown;
  error?: string;
  depth: number;
  latency_ms: number;
}

/**
 * Detect cycles: if child_flow_id already appears in ancestor chain
 */
function detectCycle(childFlowId: string, ancestors: string[]): boolean {
  return ancestors.includes(childFlowId);
}

/**
 * Execute a sub-flow by invoking the gateway with depth tracking
 */
export async function invokeSubFlow(req: SubFlowRequest): Promise<SubFlowResult> {
  const start = Date.now();

  // Depth guard
  if (req.depth >= MAX_DEPTH) {
    console.error(`[MultiAgent] Depth limit reached: ${req.depth}/${MAX_DEPTH}`);
    return {
      success: false,
      child_execution_id: null,
      output: null,
      error: `Max sub-flow depth exceeded (${MAX_DEPTH}). Aborting to prevent infinite recursion.`,
      depth: req.depth,
      latency_ms: Date.now() - start,
    };
  }

  // Cycle detection
  if (detectCycle(req.child_flow_id, req.ancestor_flow_ids)) {
    console.error(`[MultiAgent] Cycle detected: ${req.child_flow_id} already in chain [${req.ancestor_flow_ids.join(" → ")}]`);
    return {
      success: false,
      child_execution_id: null,
      output: null,
      error: `Cycle detected: flow ${req.child_flow_id} already in ancestor chain. Aborting.`,
      depth: req.depth,
      latency_ms: Date.now() - start,
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Resolve child flow's endpoint_slug from its active deployment
  const { data: childDeploy } = await supabase
    .from("agent_deployments")
    .select("endpoint_slug")
    .eq("flow_id", req.child_flow_id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!childDeploy?.endpoint_slug) {
    return {
      success: false,
      child_execution_id: null,
      output: null,
      error: `Child flow ${req.child_flow_id} has no active deployment.`,
      depth: req.depth,
      latency_ms: Date.now() - start,
    };
  }

  // Invoke gateway with depth metadata
  try {
    const gatewayUrl = `${supabaseUrl}/functions/v1/aetherforge-gateway`;
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        slug: childDeploy.endpoint_slug,
        message: typeof req.input_data.message === "string"
          ? req.input_data.message
          : JSON.stringify(req.input_data),
        session_id: req.session_id,
        channel: req.channel,
        metadata: {
          parent_execution_id: req.parent_execution_id,
          parent_flow_id: req.parent_flow_id,
          depth: req.depth + 1,
          ancestor_flow_ids: [...req.ancestor_flow_ids, req.parent_flow_id],
        },
      }),
      signal: AbortSignal.timeout(50000),
    });

    const result = await res.json();
    const childExecId = result.execution_id || null;

    // BUG-B FIX: Link parent ↔ child directly in DB by merging into fsm_snapshot.
    // Previous code had a no-op UPDATE (.eq("id", "never")) and a call to a
    // non-existent RPC (jsonb_set_execution_child) — both silently did nothing.
    if (childExecId) {
      // Read current fsm_snapshot of the parent execution, then add the child reference.
      const { data: parentExec } = await supabase
        .from("agent_executions")
        .select("fsm_snapshot")
        .eq("id", req.parent_execution_id)
        .single();

      const currentSnapshot = (parentExec?.fsm_snapshot as Record<string, unknown>) || {};
      const existingChildren = (currentSnapshot.child_execution_ids as string[]) || [];
      await supabase.from("agent_executions").update({
        fsm_snapshot: {
          ...currentSnapshot,
          child_execution_ids: [...existingChildren, childExecId],
          last_child_flow_id: req.child_flow_id,
        },
      }).eq("id", req.parent_execution_id);
    }

    return {
      success: res.ok && result.status !== "failed",
      child_execution_id: childExecId,
      output: result.output || result,
      error: result.error,
      depth: req.depth + 1,
      latency_ms: Date.now() - start,
    };
  } catch (err: unknown) {
    const msg = (err as Error).message;
    console.error(`[MultiAgent] Sub-flow invocation failed:`, msg);
    return {
      success: false,
      child_execution_id: null,
      output: null,
      error: `Sub-flow invocation failed: ${msg}`,
      depth: req.depth,
      latency_ms: Date.now() - start,
    };
  }
}
