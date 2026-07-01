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

export function useFlowBuilderState(flowId: string | null, open: boolean, projectId: string) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
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
  // skipNextLoadRef: quando o pai acaba de salvar (criou um flow novo
  // e setou o flowId), NAO queremos recarregar do banco — o state ja
  // esta correto com o que o user acabou de salvar.
  const skipNextLoadRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      return;
    }
    if (flowId) {
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
      void load();
    } else {
      // Modo "novo": editor virgem. Nao busca nada no banco.
      setFlowName("Novo Agente");
      setFlowStatus("draft");
      setNodes([]);
      setEdges([]);
      historyRef.current = [{ nodes: [], edges: [] }];
      historyIndexRef.current = 0;
      setHasUnsaved(false);
    }
  }, [open, flowId]);

  useEffect(() => {
    // Em modo "novo", nodes/edges vazios NAO sao "alteracoes nao salvas".
    if (flowId === null && nodes.length === 0 && edges.length === 0) {
      setHasUnsaved(false);
      return;
    }
    setHasUnsaved(true);
  }, [nodes, edges, flowId]);

  useEffect(() => {
    const issues = validateFlow(nodes, edges);
    setValidationErrors(issues.filter((i) => i.severity === "error").map((i) => i.message));
  }, [nodes, edges]);

  // BUG 140 FIX: Debounced save to prevent rapid concurrent saves
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const handleSave = useCallback(async (): Promise<string | null> => {
    if (isSavingRef.current) return null;
    isSavingRef.current = true;
    setSaving(true);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      toast({ title: "Voce precisa estar autenticado", variant: "destructive" });
      setSaving(false);
      isSavingRef.current = false;
      return null;
    }

    let currentFlowId = flowId;
    const flowDefinition = JSON.parse(JSON.stringify({ nodes, edges }));

    // Modo "novo": INSERT primeiro (cria o flow no banco e pega o id).
    if (!currentFlowId) {
      const { data: inserted, error: insertErr } = await (supabase as any)
        .from("agent_flows")
        .insert({
          project_id: projectId,
          user_id: userData.user.id,
          name: flowName,
          description: "",
          flow_definition: flowDefinition,
          status: "draft",
          channels: [],
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        toast({ title: "Erro ao criar agente", description: insertErr?.message ?? "Tente novamente", variant: "destructive" });
        setSaving(false);
        isSavingRef.current = false;
        return null;
      }
      currentFlowId = (inserted as { id: string }).id;
      // Pula o proximo load: o state ja esta correto com o que salvamos.
      skipNextLoadRef.current = true;
    } else {
      // Phase 9: Create version snapshot before overwriting
      try {
        const { data: versionData } = await (supabase as any)
          .from("agent_flow_versions")
          .select("version")
          .eq("flow_id", currentFlowId)
          .order("version", { ascending: false })
          .limit(1);

        const nextVersion = ((versionData as any)?.[0]?.version || 0) + 1;
        await (supabase as any).from("agent_flow_versions").insert({
          flow_id: currentFlowId,
          version: nextVersion,
          flow_definition: flowDefinition,
          flow_name: flowName,
          created_by: userData.user.id,
        });
      } catch (vErr) {
        console.warn("[FlowBuilder] Version snapshot failed:", vErr);
      }

      const { error } = await (supabase as any)
        .from("agent_flows")
        .update({
          name: flowName,
          flow_definition: flowDefinition,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentFlowId);

      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        setSaving(false);
        isSavingRef.current = false;
        return null;
      }
    }

    toast({ title: "Flow salvo!" });
    setHasUnsaved(false);
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push({ nodes: [...nodes], edges: [...edges] });
    historyIndexRef.current = historyRef.current.length - 1;
    setSaving(false);
    isSavingRef.current = false;
    return currentFlowId;
  }, [flowName, nodes, edges, flowId, projectId, toast]);

  // Publish
  const handlePublish = useCallback(async () => {
    if (validationErrors.length > 0) {
      toast({ title: "Corrija os erros antes de publicar", variant: "destructive" });
      return;
    }
    const savedId = await handleSave();
    if (!savedId) return;

    const { data: versionData } = await (supabase as any)
      .from("agent_flow_versions")
      .select("version")
      .eq("flow_id", savedId)
      .order("version", { ascending: false })
      .limit(1);

    const nextVersion = ((versionData as any)?.[0]?.version || 0) + 1;
    const { data: userData } = await supabase.auth.getUser();

    await (supabase as any).from("agent_flow_versions").insert({
      flow_id: savedId,
      version: nextVersion,
      flow_definition: JSON.parse(JSON.stringify({ nodes, edges })),
      flow_name: flowName,
      created_by: userData?.user?.id || null,
    });

    const { error } = await (supabase as any)
      .from("agent_flows")
      .update({ status: "published", published_at: new Date().toISOString(), version: nextVersion })
      .eq("id", savedId);

    if (!error) {
      setFlowStatus("published");
      toast({ title: `Agente publicado! (v${nextVersion})` });
    }
  }, [validationErrors, handleSave, nodes, edges, flowName, toast]);

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

  const handleDuplicate = useCallback(() => {
    if (!selectedNode) return;
    const newNodeId = `${selectedNode.type}_${Date.now()}`;
    const offset = { x: 80, y: 80 };
    setNodes((nds) => [...nds, {
      ...selectedNode,
      id: newNodeId,
      position: { x: selectedNode.position.x + offset.x, y: selectedNode.position.y + offset.y },
      selected: false,
      data: { ...selectedNode.data },
    }]);
    setEdges((eds) => [...eds]);
    setSelectedNode(null);
  }, [selectedNode, setNodes, setEdges]);

  const handleToggleDisabled = useCallback(() => {
    if (!selectedNode) return;
    setNodes((nds) => nds.map((n) =>
      n.id === selectedNode.id
        ? { ...n, data: { ...n.data, disabled: !(n.data as Record<string, any>)?.disabled } }
        : n
    ));
  }, [selectedNode, setNodes]);

  const handleCopy = useCallback(async () => {
    if (!selectedNode) return;
    const payload = JSON.stringify({ type: "forge-flow-nodes", nodes: [selectedNode], edges: [] });
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // Fallback for non-HTTPS environments
      const ta = document.createElement("textarea");
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }, [selectedNode]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const data = JSON.parse(text);
      if (data.type !== "forge-flow-nodes" || !data.nodes?.length) return;
      const offset = { x: 80, y: 80 };
      const newNodes = data.nodes.map((n: any) => ({
        ...n,
        id: `${n.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
        selected: true,
      }));
      setNodes((nds) => [...nds, ...newNodes]);
    } catch {
      // silent — not clipboard content or parse error
    }
  }, [setNodes]);

  return {
    // Flow data
    nodes, edges, setNodes, setEdges, onNodesChange, onEdgesChange,
    flowName, setFlowName, setFlowStatus, flowStatus, saving, hasUnsaved, validationErrors,
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
    handleDelete, handleSelectAll, handleDuplicate, handleToggleDisabled,
    handleCopy, handlePaste,
    onNodeClick, onEdgeClick, onPaneClick,
    handleNodeUpdate, handleEdgeUpdate,
    // Controla o load automatico quando o flowId muda externamente.
    // O pai deve chamar isso antes de mudar o flowId se quiser manter
    // o state interno atual.
    markSkipNextLoad: () => { skipNextLoadRef.current = true; },
  };
}
