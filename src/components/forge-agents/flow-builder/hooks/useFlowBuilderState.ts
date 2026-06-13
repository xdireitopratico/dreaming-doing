/**
 * useFlowBuilderState — Estado centralizado do FlowBuilderDialog
 * Extraído de FlowBuilderDialog (R57 Higiene Arquitetural)
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNodesState, useEdgesState, type Node, type Edge } from "@xyflow/react";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { validateFlow } from "../utils/schema-validator";
import type { PanelType } from "../flow-builder-types";

export function useFlowBuilderState(flowId: string, open: boolean) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [flowName, setFlowName] = useState("Novo Agente");
  const [flowStatus, setFlowStatus] = useState("draft");
  const [saving, setSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [agentPrimaryLang, setAgentPrimaryLang] = useState<"pt-BR" | "en" | "es">("pt-BR");
  const [agentSupportedLangs, setAgentSupportedLangs] = useState<("pt-BR" | "en" | "es")[]>(["pt-BR"]);
  const [agentAutoDetect, setAgentAutoDetect] = useState(false);

  ;
  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const historyIndexRef = useRef(-1);

  // Panel management
  const togglePanel = useCallback((panel: PanelType) => {
    setActivePanel((prev) => prev === panel ? null : panel);
    setSelectedNode(null);
    setSelectedEdge(null);
    setHighlightedNodeId(null);
  }, []);

  const closePanel = useCallback(() => {
    setActivePanel(null);
    setHighlightedNodeId(null);
  }, []);

  // Load flow
  useEffect(() => {
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("agent_flows")
        .select("name, status, flow_definition")
        .eq("id", flowId)
        .single();

      if (error || !data) {
        toast({ title: "Erro ao carregar flow", variant: "destructive" });
        return;
      }

      const flowData = data as { name: string; status: string; flow_definition: { nodes?: Node[]; edges?: Edge[] } };
      setFlowName(flowData.name);
      setFlowStatus(flowData.status);
      const def = flowData.flow_definition || { nodes: [], edges: [] };
      setNodes(def.nodes || []);
      setEdges(def.edges || []);
      historyRef.current = [{ nodes: def.nodes || [], edges: def.edges || [] }];
      historyIndexRef.current = 0;
    };
    if (open && flowId) load();
  }, [open, flowId]);

  useEffect(() => { setHasUnsaved(true); }, [nodes, edges]);

  useEffect(() => {
    const issues = validateFlow(nodes, edges);
    setValidationErrors(issues.filter((i) => i.severity === "error").map((i) => i.message));
  }, [nodes, edges]);

  // BUG 140 FIX: Debounced save to prevent rapid concurrent saves
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const handleSave = useCallback(async () => {
    if (isSavingRef.current) return; // Prevent concurrent saves
    isSavingRef.current = true;
    setSaving(true);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    // Phase 9: Create version snapshot before overwriting
    try {
      const { data: versionData } = await (supabase as any)
        .from("agent_flow_versions")
        .select("version")
        .eq("flow_id", flowId)
        .order("version", { ascending: false })
        .limit(1);

      const nextVersion = ((versionData as any)?.[0]?.version || 0) + 1;
      const { data: userData } = await supabase.auth.getUser();

      await (supabase as any).from("agent_flow_versions").insert({
        flow_id: flowId,
        version: nextVersion,
        flow_definition: JSON.parse(JSON.stringify({ nodes, edges })),
        flow_name: flowName,
        created_by: userData?.user?.id || null,
      });
    } catch (vErr) {
      console.warn("[FlowBuilder] Version snapshot failed:", vErr);
    }

    const { error } = await (supabase as any)
      .from("agent_flows")
      .update({
        name: flowName,
        flow_definition: JSON.parse(JSON.stringify({ nodes, edges })),
        updated_at: new Date().toISOString(),
      })
      .eq("id", flowId);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Flow salvo!" });
      setHasUnsaved(false);
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
      historyRef.current.push({ nodes: [...nodes], edges: [...edges] });
      historyIndexRef.current = historyRef.current.length - 1;
    }
    setSaving(false);
    isSavingRef.current = false;
  }, [flowName, nodes, edges, flowId, toast]);

  // Publish
  const handlePublish = useCallback(async () => {
    if (validationErrors.length > 0) {
      toast({ title: "Corrija os erros antes de publicar", variant: "destructive" });
      return;
    }
    await handleSave();

    const { data: versionData } = await (supabase as any)
      .from("agent_flow_versions")
      .select("version")
      .eq("flow_id", flowId)
      .order("version", { ascending: false })
      .limit(1);

    const nextVersion = ((versionData as any)?.[0]?.version || 0) + 1;
    const { data: userData } = await supabase.auth.getUser();

    await (supabase as any).from("agent_flow_versions").insert({
      flow_id: flowId,
      version: nextVersion,
      flow_definition: JSON.parse(JSON.stringify({ nodes, edges })),
      flow_name: flowName,
      created_by: userData?.user?.id || null,
    });

    const { error } = await (supabase as any)
      .from("agent_flows")
      .update({ status: "published", published_at: new Date().toISOString(), version: nextVersion })
      .eq("id", flowId);

    if (!error) {
      setFlowStatus("published");
      toast({ title: `Agente publicado! (v${nextVersion})` });
    }
  }, [validationErrors, handleSave, flowId, nodes, edges, flowName, toast]);

  // History
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const state = historyRef.current[historyIndexRef.current];
      setNodes(state.nodes);
      setEdges(state.edges);
    }
  }, [setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const state = historyRef.current[historyIndexRef.current];
      setNodes(state.nodes);
      setEdges(state.edges);
    }
  }, [setNodes, setEdges]);

  const handleRollback = useCallback((rollbackNodes: Node[], rollbackEdges: Edge[]) => {
    setNodes(rollbackNodes);
    setEdges(rollbackEdges);
    setHasUnsaved(true);
  }, [setNodes, setEdges]);

  const handleApplyTemplate = useCallback((templateNodes: Node[], templateEdges: Edge[]) => {
    setNodes(templateNodes);
    setEdges(templateEdges);
    setHasUnsaved(true);
  }, [setNodes, setEdges]);

  const handleApplyPatch = useCallback((patchNodes: Node[], patchEdges: Edge[]) => {
    setNodes(patchNodes);
    setEdges(patchEdges);
    setHasUnsaved(true);
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push({ nodes: patchNodes, edges: patchEdges });
    historyIndexRef.current = historyRef.current.length - 1;
  }, [setNodes, setEdges]);

  const handleHighlightNodes = useCallback((ids: string[]) => {
    if (ids.length > 0) setHighlightedNodeId(ids[0]);
    setTimeout(() => setHighlightedNodeId(null), 3000);
  }, []);

  // Node/Edge interactions — M4 Fix: close panel when clicking node for focus
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
    setActivePanel(null);
    setHighlightedNodeId(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
    setActivePanel(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  const handleNodeUpdate = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data } : n)));
    setSelectedNode((prev) => (prev && prev.id === nodeId ? { ...prev, data } : prev));
  }, [setNodes]);

  const handleEdgeUpdate = useCallback((edgeId: string, data: Record<string, unknown>) => {
    setEdges((eds) => eds.map((e) => (e.id === edgeId ? { ...e, data } : e)));
    setSelectedEdge((prev) => (prev && prev.id === edgeId ? { ...prev, data } : prev));
  }, [setEdges]);

  const totalComments = useMemo(() =>
    Object.values(commentCounts).reduce((a, b) => a + b, 0), [commentCounts]
  );

  const handlePrimaryLangChange = useCallback((l: "pt-BR" | "en" | "es") => {
    setAgentPrimaryLang(l);
    setAgentSupportedLangs(prev => prev.includes(l) ? prev : [...prev, l]);
  }, []);

  const handleDelete = useCallback(() => {
    if (selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
      setSelectedNode(null);
    } else if (selectedEdge) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
      setSelectedEdge(null);
    }
  }, [selectedNode, selectedEdge, setNodes, setEdges]);

  const handleSelectAll = useCallback(() => {
    onNodesChange(nodes.map((n) => ({ id: n.id, type: "select" as const, selected: true })));
  }, [nodes, onNodesChange]);

  return {
    // Flow data
    nodes, edges, setNodes, setEdges, onNodesChange, onEdgesChange,
    flowName, setFlowName, flowStatus, saving, hasUnsaved, validationErrors,
    // Selection
    selectedNode, setSelectedNode, selectedEdge, setSelectedEdge,
    // Panel
    activePanel, togglePanel, closePanel,
    highlightedNodeId, setHighlightedNodeId,
    // Notifications & comments
    unreadNotifCount, setUnreadNotifCount, commentCounts, setCommentCounts, totalComments,
    // Command palette
    showCommandPalette, setShowCommandPalette,
    // Language
    agentPrimaryLang, agentSupportedLangs, setAgentSupportedLangs,
    agentAutoDetect, setAgentAutoDetect, handlePrimaryLangChange,
    // Actions
    handleSave, handlePublish, handleUndo, handleRedo,
    handleRollback, handleApplyTemplate, handleApplyPatch, handleHighlightNodes,
    handleDelete, handleSelectAll,
    onNodeClick, onEdgeClick, onPaneClick,
    handleNodeUpdate, handleEdgeUpdate,
  };
}
