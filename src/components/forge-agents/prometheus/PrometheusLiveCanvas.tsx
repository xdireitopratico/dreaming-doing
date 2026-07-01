/**
 * PrometheusLiveCanvas — Canvas React Flow em modo view-only durante auto-build
 * Rodada P1 | Limite: < 100 linhas
 * BUG 147 FIX: ReactFlowProvider moved outside the memo component
 */
import { memo, useMemo } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TriggerNode } from "../flow-builder/nodes/TriggerNode";
import { LLMNode } from "../flow-builder/nodes/LLMNode";
import { ToolNode } from "../flow-builder/nodes/ToolNode";
import { ConditionNode } from "../flow-builder/nodes/ConditionNode";
import { OutputGuardNode } from "../flow-builder/nodes/OutputGuardNode";
import { Bot } from "lucide-react";

const nodeTypes = {
  trigger: TriggerNode,
  llm: LLMNode,
  tool: ToolNode,
  condition: ConditionNode,
  output_guard: OutputGuardNode,
};

const MINIMAP_COLORS: Record<string, string> = {
  trigger: "#22c55e", llm: "#3b82f6", tool: "#eab308",
  condition: "#6b7280", output_guard: "#f59e0b",
};

interface Props {
  nodes: Node[];
  edges: Edge[];
  readOnly?: boolean;
}

// BUG 147 FIX: Inner component without Provider to prevent state reset
const PrometheusLiveCanvasInner = memo(function PrometheusLiveCanvasInner({ nodes, edges, readOnly = true }: Props) {
  const displayNodes = useMemo(() => nodes, [nodes]);

  return (
    <ReactFlow
      nodes={displayNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable={!readOnly}
      fitView
      className="bg-muted/30"
    >
      <Background gap={20} size={1} />
      <Controls showInteractive={false} />
      <MiniMap nodeColor={(node: Node) => MINIMAP_COLORS[node.type || ""] || "#94a3b8"} />
    </ReactFlow>
  );
});

// BUG 147 FIX: Provider wraps outer component, not recreated on inner re-renders
export const PrometheusLiveCanvas = memo(function PrometheusLiveCanvas({ nodes, edges, readOnly = true }: Props) {
  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 text-muted-foreground gap-3">
        <Bot className="h-12 w-12 opacity-30" />
        <p className="text-sm">O canvas será preenchido durante a construção</p>
        <p className="text-xs opacity-60">Descreva seu agente no chat para começar</p>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <ReactFlowProvider>
        <PrometheusLiveCanvasInner nodes={nodes} edges={edges} readOnly={readOnly} />
      </ReactFlowProvider>
    </div>
  );
});
