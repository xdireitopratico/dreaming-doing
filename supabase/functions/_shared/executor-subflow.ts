/**
 * SubFlow Node Executor — Extracted from gateway-core.ts (R57)
 */
import { invokeSubFlow, type SubFlowResult } from "./multi-agent-bus.ts";

export async function executeSubFlowNode(
  node: any, input: any, flowId: string, executionId: string, sessionId: string, channel: string, depth: number, ancestorFlowIds: string[]
): Promise<any> {
  const config = node.data?.config || {};
  const childFlowId = config.flow_id;

  if (!childFlowId) {
    return { status: "error", error: "No flow_id configured on SubFlowNode" };
  }

  const result: SubFlowResult = await invokeSubFlow({
    parent_execution_id: executionId, parent_flow_id: flowId,
    child_flow_id: childFlowId, input_data: input,
    session_id: sessionId, channel, depth, ancestor_flow_ids: ancestorFlowIds,
  });

  return {
    flow_name: config.flow_name || childFlowId, child_flow_id: childFlowId,
    child_execution_id: result.child_execution_id,
    status: result.success ? "completed" : "error",
    output: result.output, depth: result.depth,
    latency_ms: result.latency_ms, error: result.error,
    engine: "multi_agent_bus",
  };
}
