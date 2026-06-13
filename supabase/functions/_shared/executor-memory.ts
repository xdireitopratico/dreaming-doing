/**
 * Memory Node Executor — Extracted from gateway-core.ts (R57)
 */
import { executeMemory, type MemoryResult } from "./memory-manager.ts";

export async function executeMemoryNode(node: any, input: any, flowId: string, sessionId: string): Promise<any> {
  const config = node.data?.config || {};
  const operation = config.operation || "read";
  const key = config.key || input.key || "default";
  const scope = config.scope || "short_term";
  const value = operation === "write" ? (input.value ?? input.response ?? input.message ?? config.default_value) : undefined;

  const result: MemoryResult = await executeMemory({
    flow_id: flowId, session_id: sessionId,
    operation, key, value, scope,
    ttl_seconds: config.ttl_seconds,
    importance_score: config.importance_score,
    metadata: config.metadata,
  });

  return {
    operation: result.operation, success: result.success,
    key: result.key || key, scope,
    value: result.value, entries: result.entries,
    error: result.error, engine: "memory_manager",
  };
}
