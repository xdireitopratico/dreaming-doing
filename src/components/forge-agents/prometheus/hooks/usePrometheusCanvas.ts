/**
 * usePrometheusCanvas — Estado do canvas live do Prometheus
 * Rodada P1: Gerencia nós/edges que são injetados via build events
 * Limite: < 100 linhas
 */
import { useState, useCallback } from "react";
import { type Node, type Edge } from "@/types/xyflow-react-shim";
import type { PrometheusPhase } from "./prometheus-types";

export interface BuildEvent {
  type: "node_added" | "edge_added" | "node_updated" | "clear";
  data: Record<string, unknown>;
}

const PHASE_DEMO_NODES: Record<string, Node[]> = {
  building: [
    { id: "trigger_1", type: "trigger", position: { x: 50, y: 200 }, data: { label: "TRIGGER", config: {} } },
    { id: "llm_1", type: "llm", position: { x: 300, y: 200 }, data: { label: "LLM", config: {} } },
    { id: "condition_1", type: "condition", position: { x: 550, y: 200 }, data: { label: "CONDITION", config: {} } },
    { id: "tool_1", type: "tool", position: { x: 800, y: 120 }, data: { label: "TOOL", config: {} } },
    { id: "output_guard_1", type: "output_guard", position: { x: 800, y: 300 }, data: { label: "OUTPUT GUARD", config: {} } },
  ],
  review: [
    { id: "trigger_1", type: "trigger", position: { x: 50, y: 200 }, data: { label: "TRIGGER", config: {} } },
    { id: "llm_1", type: "llm", position: { x: 300, y: 200 }, data: { label: "LLM", config: {} } },
    { id: "condition_1", type: "condition", position: { x: 550, y: 200 }, data: { label: "CONDITION", config: {} } },
    { id: "tool_1", type: "tool", position: { x: 800, y: 120 }, data: { label: "TOOL", config: {} } },
    { id: "output_guard_1", type: "output_guard", position: { x: 800, y: 300 }, data: { label: "OUTPUT GUARD", config: {} } },
  ],
};

const PHASE_DEMO_EDGES: Record<string, Edge[]> = {
  building: [
    { id: "e1", source: "trigger_1", target: "llm_1", animated: true, style: { stroke: "hsl(var(--primary))" } },
    { id: "e2", source: "llm_1", target: "condition_1", animated: true, style: { stroke: "hsl(var(--primary))" } },
    { id: "e3", source: "condition_1", target: "tool_1", animated: true, style: { stroke: "hsl(var(--primary))" } },
    { id: "e4", source: "condition_1", target: "output_guard_1", animated: true, style: { stroke: "hsl(var(--primary))" } },
  ],
  review: [
    { id: "e1", source: "trigger_1", target: "llm_1", animated: false, style: { stroke: "hsl(var(--primary))" } },
    { id: "e2", source: "llm_1", target: "condition_1", animated: false, style: { stroke: "hsl(var(--primary))" } },
    { id: "e3", source: "condition_1", target: "tool_1", animated: false, style: { stroke: "hsl(var(--primary))" } },
    { id: "e4", source: "condition_1", target: "output_guard_1", animated: false, style: { stroke: "hsl(var(--primary))" } },
  ],
};

export function usePrometheusCanvas() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const applyPhaseDemo = useCallback((phase: PrometheusPhase) => {
    const demoNodes = PHASE_DEMO_NODES[phase];
    const demoEdges = PHASE_DEMO_EDGES[phase];
    if (demoNodes) setNodes(demoNodes);
    if (demoEdges) setEdges(demoEdges);
  }, []);

  const handleBuildEvent = useCallback((event: BuildEvent) => {
    switch (event.type) {
      case "node_added":
        setNodes((prev) => [...prev, event.data as unknown as Node]);
        break;
      case "edge_added":
        setEdges((prev) => [...prev, event.data as unknown as Edge]);
        break;
      case "clear":
        setNodes([]);
        setEdges([]);
        break;
    }
  }, []);

  return { nodes, edges, applyPhaseDemo, handleBuildEvent };
}
