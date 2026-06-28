/**
 * FlowBuilderDialog — Orchestrator for the visual agent builder
 * Themed: Prometheus Deep Blue (prometheus-studio class)
 *
 * Aceita flowId: string | null.
 *   - string: edicao de um flow existente (carrega do banco)
 *   - null:   modo "novo" (editor virgem, sem persistir ate user clicar Salvar)
 */
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { type Node } from "@/types/xyflow-react-shim";
import { useFlowShortcuts } from "./hooks/useFlowShortcuts";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NodePalette } from "./NodePalette";
import { NodePropertiesPanel } from "./NodePropertiesPanel";
import { EdgePropertiesPanel } from "./EdgePropertiesPanel";
import { FlowToolbar } from "./FlowToolbar";
import { FlowCanvas } from "./FlowCanvas";
import { FlowPanelRenderer } from "./FlowPanelRenderer";
import { useFlowBuilderState } from "./hooks/useFlowBuilderState";
import { useGraduationGate } from "./GraduationGate";
import { CloseConfirmDialog } from "./CloseConfirmDialog";
import type { NodeStatus } from "./nodes/CanvasNodeStatusIcons";
import "@/styles/forge-agents-theme.css";

const CommandPalette = lazy(() => import("./CommandPalette").then(m => ({ default: m.CommandPalette })));

interface FlowBuilderDialogProps {
  flowId: string | null;
  projectId: string;
  open: boolean;
  onClose: () => void;
  /**
   * Notifica o pai quando o flowId muda (ex: depois de salvar um flow novo).
   * O pai deve atualizar seu state para manter o editor aberto com o id real.
   */
  onFlowIdChange?: (newId: string) => void;
}

export function FlowBuilderDialog({ flowId, projectId, open, onClose, onFlowIdChange }: FlowBuilderDialogProps) {
  const s = useFlowBuilderState(flowId, open, projectId);

  // Wrapper de save: depois de salvar um flow novo, propaga o id pro pai
  // (e o hook ja marca skipNextLoadRef, entao nao recarregamos o estado).
  const handleSaveAndPropagate = useCallback(async () => {
    const newId = await s.handleSave();
    if (newId && flowId === null && onFlowIdChange) {
      onFlowIdChange(newId);
    }
  }, [s.handleSave, flowId, onFlowIdChange]);

  // M4 Fix: node/edge selection now works independently of panel state

  const fitViewCallbackRef = useRef<(() => void) | null>(null);
  const chatToggleRef = useRef<(() => void) | null>(null);
  const chatCollapseRef = useRef<(() => void) | null>(null);
  const chatOpenRef = useRef(false);

  const registerChatToggle = useCallback((fn: () => void) => {
    chatToggleRef.current = fn;
  }, []);

  const registerChatCollapse = useCallback((fn: () => void) => {
    chatCollapseRef.current = fn;
  }, []);

  const handleChatOpenChange = useCallback((open: boolean) => {
    chatOpenRef.current = open;
  }, []);

  const handleChatEscape = useCallback(() => {
    if (chatOpenRef.current && chatCollapseRef.current) {
      chatCollapseRef.current();
      return true;
    }
    return false;
  }, []);

  // P3.5: Graduation Gate — intercept publish to verify credentials
  const { checkCredentials, GateDialog, checking: graduationChecking } = useGraduationGate({
    flowId: flowId ?? "",
    nodes: s.nodes,
    onProceed: s.handlePublish,
  });

  // ═══ MODAL: confirmacao ao fechar com alteracoes nao salvas ═══
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  // ═══ Execution status feedback (F2.1) ═══
  const [nodeStatusMap, setNodeStatusMap] = useState<Record<string, NodeStatus>>({});
  const handleClearExecutionData = useCallback(() => setNodeStatusMap({}), []);

  const handleContextMenuAction = useCallback((actionId: string, nodeId: string) => {
    switch (actionId) {
      case "delete": s.handleDelete(); break;
      case "select_all": s.handleSelectAll(); break;
      case "duplicate": s.handleDuplicate(); break;
      case "copy": s.handleCopy(); break;
      case "toggle": s.handleToggleDisabled(); break;
      case "open":
        if (s.selectedNode) s.setSelectedNode(s.selectedNode);
        break;
      // copy, rename, execute are handled via shortcuts
    }
  }, [s]);

  const handleRequestClose = useCallback(() => {
    if (s.hasUnsaved) {
      setCloseConfirmOpen(true);
    } else {
      setNodeStatusMap({});
      onClose();
    }
  }, [s.hasUnsaved, onClose]);

  const handleConfirmClose = useCallback(async (action: "discard" | "save_and_close") => {
    setCloseConfirmOpen(false);
    if (action === "discard") {
      onClose();
      return;
    }
    // save_and_close
    const newId = await s.handleSave();
    if (newId) {
      if (flowId === null && onFlowIdChange) onFlowIdChange(newId);
      onClose();
    }
    setNodeStatusMap({});
  }, [s.handleSave, flowId, onFlowIdChange, onClose]);

  const shortcutActions = useMemo(() => ({
    onSave: handleSaveAndPropagate,
    onPublish: checkCredentials,
    onUndo: s.handleUndo,
    onRedo: s.handleRedo,
    onDelete: s.handleDelete,
    onCommandPalette: () => s.setShowCommandPalette(true),
    onEscape: () => {
      if (handleChatEscape()) return;
      s.closePanel();
      s.setSelectedNode(null);
      s.setSelectedEdge(null);
      s.setShowCommandPalette(false);
    },
    onToggleChat: () => chatToggleRef.current?.(),
    onToggleTest: () => s.togglePanel("test"),
    onToggleDeploy: () => s.togglePanel("deploy"),
    onToggleDebug: () => s.togglePanel("debug"),
    onSelectAll: s.handleSelectAll,
    onFitView: () => fitViewCallbackRef.current?.(),
    onCopy: s.handleCopy,
    onPaste: s.handlePaste,
  }), [handleSaveAndPropagate, checkCredentials, s.handleUndo, s.handleRedo, s.handleDelete, s.closePanel, s.togglePanel, s.handleSelectAll, handleChatEscape, s.handleCopy, s.handlePaste]);

  useFlowShortcuts({ enabled: open, actions: shortcutActions });

  const NODE_LABELS: Record<string, string> = {
    trigger: "Trigger", llm: "LLM", tool: "Tool", condition: "Condição",
    switch: "Switch", transformer: "Transformer", loop: "Loop",
    rag_search: "RAG Search", memory: "Memória", stt: "STT", tts: "TTS",
    vision: "Vision", delay: "Delay", error_handler: "Error Handler",
    hitl: "Aprovação", sub_flow: "Sub-Flow", output_guard: "Output Guard",
  };

  const handleAddNodeByClick = useCallback((nodeType: string) => {
    const offsetX = 300 + Math.random() * 200;
    const offsetY = 100 + Math.random() * 200;
    const newNode: Node = {
      id: `${nodeType}_${Date.now()}`, type: nodeType,
      position: { x: offsetX, y: offsetY },
      data: { label: NODE_LABELS[nodeType] || nodeType, config: {} },
    };
    s.setNodes((nds) => [...nds, newNode]);
  }, [s.setNodes]);

  return (
    <Dialog open={open} onOpenChange={() => handleRequestClose()}>
      <DialogContent className="prometheus-studio max-w-[100vw] w-[100vw] h-[100vh] max-h-[100vh] p-0 gap-0 rounded-none border-none" style={{ background: 'linear-gradient(135deg, #1a1e27, #0b0d12)' }}>
        <FlowToolbar
          flowName={s.flowName}
          flowStatus={s.flowStatus}
          hasUnsaved={s.hasUnsaved}
          saving={s.saving}
          validationErrors={s.validationErrors}
          activePanel={s.activePanel}
          unreadNotifCount={s.unreadNotifCount}
          totalComments={s.totalComments}
          onFlowNameChange={s.setFlowName}
          onClose={handleRequestClose}
          onSave={handleSaveAndPropagate}
          onPublish={checkCredentials}
          onUndo={s.handleUndo}
          onRedo={s.handleRedo}
          onTogglePanel={s.togglePanel}
        />

        <div className="flex flex-1 h-[calc(100vh-3rem)]">
          <NodePalette onAddNode={handleAddNodeByClick} />

          <FlowCanvas
            nodes={s.nodes}
            edges={s.edges}
            highlightedNodeId={s.highlightedNodeId}
            onNodesChange={s.onNodesChange}
            onEdgesChange={s.onEdgesChange}
            onSetEdges={s.setEdges}
            onSetNodes={s.setNodes}
            onNodeClick={s.onNodeClick}
            onEdgeClick={s.onEdgeClick}
            onPaneClick={s.onPaneClick}
            onRegisterFitView={(fn) => { fitViewCallbackRef.current = fn; }}
            flowId={flowId ?? undefined}
            chatEnabled={open}
            onApplyPatch={s.handleApplyPatch}
            onHighlightNodes={s.handleHighlightNodes}
            registerChatToggle={registerChatToggle}
            registerChatCollapse={registerChatCollapse}
            onChatOpenChange={handleChatOpenChange}
            nodeStatusMap={nodeStatusMap}
            onNodeStatusChange={setNodeStatusMap}
            onUndo={s.handleUndo}
            onClearExecutionData={handleClearExecutionData}
            onContextMenuAction={handleContextMenuAction}
          />

          {selectedNode()}
          {selectedEdge()}

          <FlowPanelRenderer
            activePanel={s.activePanel}
            flowId={flowId ?? ""}
            flowName={s.flowName}
            nodes={s.nodes}
            edges={s.edges}
            onHighlightNode={s.setHighlightedNodeId}
            onClose={s.closePanel}
            onApplyTemplate={s.handleApplyTemplate}
            onRollback={s.handleRollback}
            onUnreadChange={s.setUnreadNotifCount}
            onCommentCountChange={s.setCommentCounts}
            agentPrimaryLang={s.agentPrimaryLang}
            agentSupportedLangs={s.agentSupportedLangs}
            agentAutoDetect={s.agentAutoDetect}
            onPrimaryLangChange={s.handlePrimaryLangChange}
            onSupportedLangsChange={s.setAgentSupportedLangs}
            onAutoDetectChange={s.setAgentAutoDetect}
            onNodeStatusChange={setNodeStatusMap}
          />
        </div>
      </DialogContent>

      <GateDialog />

      <CloseConfirmDialog
        open={closeConfirmOpen}
        onConfirm={handleConfirmClose}
        onCancel={() => setCloseConfirmOpen(false)}
      />

      <Suspense fallback={null}>
        {s.showCommandPalette && (
          <CommandPalette
            open={s.showCommandPalette}
            onClose={() => s.setShowCommandPalette(false)}
            onTogglePanel={s.togglePanel}
            onSave={handleSaveAndPropagate}
            onPublish={s.handlePublish}
            onUndo={s.handleUndo}
            onRedo={s.handleRedo}
          />
        )}
      </Suspense>
    </Dialog>
  );

  function selectedNode() {
    if (!s.selectedNode) return null;
    return (
      <NodePropertiesPanel
        flowId={flowId ?? ""}
        node={s.selectedNode}
        onUpdate={s.handleNodeUpdate}
        onDelete={(nodeId) => {
          s.setNodes((nds) => nds.filter((n) => n.id !== nodeId));
          s.setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
          s.setSelectedNode(null);
        }}
        onClose={() => s.setSelectedNode(null)}
      />
    );
  }

  function selectedEdge() {
    if (!s.selectedEdge || s.selectedNode) return null;
    return (
      <EdgePropertiesPanel
        edge={s.selectedEdge}
        sourceNodeLabel={s.nodes.find((n) => n.id === s.selectedEdge!.source)?.data?.label as string || s.selectedEdge!.source}
        targetNodeLabel={s.nodes.find((n) => n.id === s.selectedEdge!.target)?.data?.label as string || s.selectedEdge!.target}
        onUpdate={s.handleEdgeUpdate}
        onClose={() => s.setSelectedEdge(null)}
      />
    );
  }
}
