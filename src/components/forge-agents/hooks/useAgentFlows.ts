/**
 * useAgentFlows — Hook para CRUD de agent flows
 * Extraído de AdminAgentBuilderView (R57 Higiene Arquitetural)
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";

export interface AgentFlow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  channels: string[];
  version: number;
  total_executions: number;
  avg_quality_score: number | null;
  avg_latency_ms: number | null;
  created_at: string;
  updated_at: string;
  flow_definition?: Record<string, unknown> | null;
}

export function useAgentFlows(projectId?: string) {
  const [flows, setFlows] = useState<AgentFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  const fetchFlows = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("agent_flows")
      .select("id, name, description, status, channels, version, total_executions, avg_quality_score, avg_latency_ms, created_at, updated_at, flow_definition")
      .order("updated_at", { ascending: false });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[AgentBuilder] Erro ao carregar flows:", error);
    } else {
      setFlows((data as AgentFlow[]) || []);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);

  const handleCreate = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    const { data, error } = await supabase
      .from("agent_flows")
      .insert({
        name: "Novo Agente",
        description: "",
        user_id: userData.user.id,
        ...(projectId ? { project_id: projectId } : {}),
        flow_definition: { nodes: [], edges: [] },
        status: "draft",
      })
      .select("id")
      .single();

    if (error) {
      toast({ title: "Erro ao criar agente", description: error.message, variant: "destructive" });
      return;
    }

    setSelectedFlowId((data as { id: string }).id);
    setBuilderOpen(true);
    fetchFlows();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("agent_flows").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao deletar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Agente removido" });
      fetchFlows();
    }
  };

  const handleDuplicate = async (flow: AgentFlow) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    const { data: original } = await supabase
      .from("agent_flows")
      .select("flow_definition")
      .eq("id", flow.id)
      .single();

    if (!original) return;

    await supabase.from("agent_flows").insert([{
      name: `${flow.name} (cópia)`,
      description: flow.description,
      user_id: userData.user.id,
      ...(projectId ? { project_id: projectId } : {}),
      flow_definition: JSON.parse(JSON.stringify(original.flow_definition)),
      status: "draft" as const,
      channels: flow.channels,
    }]);

    toast({ title: "Agente duplicado" });
    fetchFlows();
  };

  const openBuilder = (id: string) => {
    setSelectedFlowId(id);
    setBuilderOpen(true);
  };

  const closeBuilder = () => {
    setBuilderOpen(false);
    setSelectedFlowId(null);
    fetchFlows();
  };

  const filteredFlows = flows.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return {
    flows, filteredFlows, loading, search, setSearch,
    selectedFlowId, builderOpen,
    handleCreate, handleDelete, handleDuplicate,
    openBuilder, closeBuilder,
  };
}
