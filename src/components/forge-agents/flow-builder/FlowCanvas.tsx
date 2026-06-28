/**
 * FlowCanvas — ReactFlow canvas wrapper
 * Extraído de FlowBuilderDialog (Rodada auditoria)
 */
import { memo, useCallback, useEffect, useMemo } from "react";
import { injectN8nNodeAnimations } from "./nodes/BaseNode";
import { injectNodeToolbarStyles } from "./nodes/NodeToolbar";
import type { NodeStatus } from "./nodes/CanvasNodeStatusIcons";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useReactFlow, addEdge,
  type Node, type Edge, type Connection, type OnNodesChange, type OnEdgesChange,
} from "@/types/xyflow-react-shim";
import "@xyflow/react/dist/style.css";
import { TriggerNode } from "./nodes/TriggerNode";
import { LLMNode } from "./nodes/LLMNode";
import { ToolNode } from "./nodes/ToolNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { OutputGuardNode } from "./nodes/OutputGuardNode";
import { STTNode } from "./nodes/STTNode";
import { TTSNode } from "./nodes/TTSNode";
import { RAGSearchNode } from "./nodes/RAGSearchNode";
import { HITLNode } from "./nodes/HITLNode";
import { LoopNode } from "./nodes/LoopNode";
import { SwitchNode } from "./nodes/SwitchNode";
import { MemoryNode } from "./nodes/MemoryNode";
import { DelayNode } from "./nodes/DelayNode";
import { SubFlowNode } from "./nodes/SubFlowNode";
import { TransformerNode } from "./nodes/TransformerNode";
import { ErrorHandlerNode } from "./nodes/ErrorHandlerNode";
import { VisionNode } from "./nodes/VisionNode";
import { ConditionalEdge } from "./edges/ConditionalEdge";
import { FlowBuilderChatDock } from "./FlowBuilderChatDock";

const nodeTypes = {
  trigger: TriggerNode, llm: LLMNode, tool: ToolNode,
  condition: ConditionNode, output_guard: OutputGuardNode,
  stt: STTNode, tts: TTSNode, rag_search: RAGSearchNode,
  hitl: HITLNode, loop: LoopNode, switch: SwitchNode,
  memory: MemoryNode, delay: DelayNode, sub_flow: SubFlowNode,
  transformer: TransformerNode, error_handler: ErrorHandlerNode,
  vision: VisionNode,
};

const edgeTypes = { conditional: ConditionalEdge };

function FlowCanvasInternals({
  onRegisterFitView,
}: {
  onRegisterFitView?: (fn: () => void) => void;
}) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    onRegisterFitView?.(() => fitView({ duration: 300 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitView]);
  return null;
}

const MINIMAP_COLORS: Record<string, string> = {
  trigger: "#22c55e", llm: "#fbbf24", tool: "#eab308",
  condition: "#6b7280", output_guard: "#f59e0b", stt: "#a855f7",
  tts: "#f97316", rag_search: "#b45309", hitl: "#ef4444",
  loop: "#6b7280", switch: "#6366f1", memory: "#ec4899",
  delay: "#9ca3af", sub_flow: "#1f2937", transformer: "#06b6d4",
  error_handler: "#dc2626", vision: "#7c3aed",
};

interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  highlightedNodeId: string | null;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onSetEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onSetNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
  onRegisterFitView?: (fn: () => void) => void;
  flowId?: string;
  chatEnabled?: boolean;
  onApplyPatch?: (nodes: Node[], edges: Edge[]) => void;
  onHighlightNodes?: (ids: string[]) => void;
  registerChatToggle?: (fn: () => void) => void;
  registerChatCollapse?: (fn: () => void) => void;
  onChatOpenChange?: (open: boolean) => void;
  /** Map of node ID → execution status (set externally from runtime) */
  nodeStatusMap?: Record<string, NodeStatus>;
  /** Called when execution status changes (so panels can update the map) */
  onNodeStatusChange?: (map: Record<string, NodeStatus>) => void;
}

export const FlowCanvas = memo(function FlowCanvas({
  nodes, edges, highlightedNodeId,
  onNodesChange, onEdgesChange, onSetEdges, onSetNodes,
  onNodeClick, onEdgeClick, onPaneClick,
  onRegisterFitView,
  flowId, chatEnabled = false, onApplyPatch, onHighlightNodes,
  registerChatToggle, registerChatCollapse, onChatOpenChange,
  nodeStatusMap, onNodeStatusChange,
}: FlowCanvasProps) {
  // Inject n8n node CSS animations once
  useEffect(() => { injectN8nNodeAnimations(); injectNodeToolbarStyles(); }, []);

  const displayNodes = useMemo(() =>
    nodes.map((n) => {
      const execStatus = nodeStatusMap?.[n.id] ?? (n.data as Record<string, unknown>)?.status as string | undefined;
      return {
        ...n,
        data: {
          ...n.data,
          ...(execStatus ? { status: execStatus } : {}),
        },
        className: highlightedNodeId === n.id ? "ring-4 ring-primary ring-offset-2 rounded-lg" : "",
      };
    }),
    [nodes, highlightedNodeId, nodeStatusMap]
  );

  const onConnect = useCallback((params: Connection) => {
    onSetEdges((eds) => addEdge({
      ...params,
      type: "conditional", animated: true,
      data: { label: "", condition: "", edge_type: "default", priority: 0 },
      style: { stroke: "hsl(var(--primary))" },
      source: params.source ?? "",
      target: params.target ?? "",
    }, eds));
  }, [onSetEdges]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const nodeType = event.dataTransfer.getData("application/reactflow");
    if (!nodeType) return;
    const bounds = (event.target as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
    if (!bounds) return;
    const position = { x: event.clientX - bounds.left - 75, y: event.clientY - bounds.top - 25 };
    const NODE_LABELS: Record<string, string> = {
      trigger: "Trigger", llm: "LLM", tool: "Tool", condition: "Condição",
      switch: "Switch", transformer: "Transformer", loop: "Loop",
      rag_search: "RAG Search", memory: "Memória", stt: "STT", tts: "TTS",
      vision: "Vision", delay: "Delay", error_handler: "Error Handler",
      hitl: "Aprovação", sub_flow: "Sub-Flow", output_guard: "Output Guard",
    };
    const newNode: Node = {
      id: `${nodeType}_${Date.now()}`, type: nodeType, position,
      data: { label: NODE_LABELS[nodeType] || nodeType, config: {} },
    };
    onSetNodes((nds) => [...nds, newNode]);
  }, [onSetNodes]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  return (
    <div className="flex-1 relative">
      <ReactFlowProvider>
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: "conditional", animated: true }}
          fitView
          style={{ background: 'var(--ps-bg-deep, hsl(225 30% 4%))' }}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background gap={20} size={1.5} color="rgba(255,255,255,0.10)" />
          <Controls className="!bg-[var(--ps-bg-deep)] !border-[var(--ps-border)] !shadow-lg [&>button]:!bg-[var(--ps-bg-surface)] [&>button]:!border-[var(--ps-border)] [&>button]:!text-[var(--ps-cream-60)] [&>button:hover]:!bg-[var(--ps-bg-surface-hover)]" />
          <MiniMap
            nodeColor={(node: Node) => MINIMAP_COLORS[node.type || ""] || "#94a3b8"}
            style={{ background: 'var(--ps-bg)' }}
            maskColor="rgba(0,0,0,0.6)"
          />
          <FlowCanvasInternals onRegisterFitView={onRegisterFitView} />
        </ReactFlow>
      </ReactFlowProvider>

      {flowId && onApplyPatch && (
        <FlowBuilderChatDock
          flowId={flowId}
          enabled={chatEnabled}
          nodes={nodes}
          edges={edges}
          onApplyPatch={onApplyPatch}
          onHighlightNodes={onHighlightNodes}
          registerToggle={registerChatToggle}
          registerCollapse={registerChatCollapse}
          onOpenChange={onChatOpenChange}
        />
      )}

      {/* Empty canvas guidance */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center max-w-xs space-y-3 animate-in fade-in duration-500">
            <div className="text-4xl">🧩</div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ps-cream-80)' }}>
              Comece arrastando um nó
            </h3>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ps-cream-40)' }}>
              Arraste um <strong style={{ color: 'var(--ps-green)' }}>Trigger</strong> da barra lateral para iniciar seu fluxo.
              Depois conecte nós como <strong style={{ color: 'var(--ps-blue)' }}>LLM</strong>, <strong style={{ color: 'var(--ps-orange)' }}>Tool</strong> e outros.
            </p>
            <div className="flex flex-col gap-1.5 text-[10px]" style={{ color: 'var(--ps-cream-25)' }}>
              <span>⌨️ <strong>Ctrl+K</strong> — Paleta de comandos</span>
              <span>🗑️ <strong>Delete</strong> — Excluir nó selecionado</span>
              <span>💾 <strong>Ctrl+S</strong> — Salvar</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
