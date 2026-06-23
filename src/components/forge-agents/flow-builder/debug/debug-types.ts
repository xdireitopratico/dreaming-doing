/**
 * Debug types and shared utilities
 */
import type { Node, Edge } from "@/types/xyflow-react-shim";

export interface BreakpointInfo {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  enabled: boolean;
  condition?: string;
  hitCount: number;
}

export interface DebugStep {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  status: "pending" | "running" | "paused" | "completed" | "error" | "skipped";
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  error?: string;
}

export interface ConsoleEntry {
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  data?: unknown;
}

export type DebugState = "idle" | "running" | "paused" | "completed" | "error";

export function buildExecutionOrder(nodes: Node[], edges: Edge[]): string[] {
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  nodes.forEach((n) => { adj.set(n.id, []); inDeg.set(n.id, 0); });
  edges.forEach((e) => {
    adj.get(e.source)?.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
  });
  const queue = nodes.filter((n) => (inDeg.get(n.id) || 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) || []) {
      const d = (inDeg.get(next) || 1) - 1;
      inDeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return order;
}
