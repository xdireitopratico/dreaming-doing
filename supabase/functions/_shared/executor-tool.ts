/**
 * Tool Node Executor — Extracted from gateway-core.ts (R57)
 */
import { executeTool, type ToolExecutionResult } from "./tool-executor.ts";

export async function executeToolNode(
  _supabase: any, node: any, input: any, flowId: string, executionId: string
): Promise<any> {
  const config = node.data?.config || {};
  const toolName = config.tool_name;

  if (!toolName) {
    return { tool_name: "unknown", status: "error", error: "No tool_name configured" };
  }

  const toolResult: ToolExecutionResult = await executeTool({
    tool_name: toolName,
    input_data: { ...input, ...(config.tool_input || {}) },
    execution_id: executionId,
    tenant_id: flowId,
    timeout_ms: config.timeout_ms,
  });

  return {
    tool_name: toolResult.tool_name, display_name: toolResult.display_name,
    status: toolResult.status, result: toolResult.result,
    duration_ms: toolResult.duration_ms, retries: toolResult.retries,
    idempotency_key: toolResult.idempotency_key, circuit_state: toolResult.circuit_state,
    error: toolResult.error,
  };
}
