/**
 * useAgentMetrics — Hook para buscar e computar métricas do agente
 * Extraído de AgentAnalyticsPanel (R57 Higiene Arquitetural)
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ExecutionRow {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_tokens_in: number | null;
  total_tokens_out: number | null;
  total_cost_cents: number | null;
  channel: string | null;
}

interface StepRow {
  node_id: string;
  node_type: string;
  latency_ms: number | null;
  status: string;
}

export type Period = "24h" | "7d" | "30d" | "all";

export interface SlowestNode {
  nodeId: string;
  type: string;
  avg: number;
  count: number;
}

export interface DailyExecData {
  total: number;
  success: number;
  failed: number;
}

export function useAgentMetrics(flowId: string) {
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<Period>("7d");

  const periodDate = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "24h": return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case "7d": return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      default: return "2020-01-01T00:00:00Z";
    }
  }, [period]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const execRes = await supabase
      .from("agent_executions")
      .select("id, status, started_at, completed_at, total_tokens_in, total_tokens_out, total_cost_cents, channel")
      .eq("flow_id", flowId)
      .gte("started_at", periodDate)
      .order("started_at", { ascending: false })
      .limit(500);

    if (execRes.data) setExecutions(execRes.data as unknown as ExecutionRow[]);

    const execIds = execRes.data && execRes.data.length > 0
      ? execRes.data.map((e: any) => e.id)
      : ["00000000-0000-0000-0000-000000000000"];

    const stepsRes = await supabase
      .from("agent_execution_steps")
      .select("node_id, node_type, latency_ms, status, execution_id")
      .in("execution_id", execIds)
      .gte("started_at", periodDate)
      .limit(1000);

    if (stepsRes.data) setSteps(stepsRes.data as unknown as StepRow[]);
    setLoading(false);
  }, [flowId, periodDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Computed metrics
  const totalExec = executions.length;
  const successExec = executions.filter((e) => e.status === "completed").length;
  const failedExec = executions.filter((e) => e.status === "failed").length;
  const errorRate = totalExec > 0 ? ((failedExec / totalExec) * 100).toFixed(1) : "0";

  const latencies = executions
    .filter((e) => e.started_at && e.completed_at)
    .map((e) => new Date(e.completed_at!).getTime() - new Date(e.started_at).getTime())
    .sort((a, b) => a - b);

  const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  const totalTokens = executions.reduce((s, e) => s + (e.total_tokens_in || 0) + (e.total_tokens_out || 0), 0);
  const totalCost = executions.reduce((s, e) => s + ((e.total_cost_cents || 0) / 100), 0);

  const channelMap = useMemo(() => {
    const map: Record<string, number> = {};
    executions.forEach((e) => { const ch = e.channel || "unknown"; map[ch] = (map[ch] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [executions]);

  const dailyExec = useMemo((): [string, DailyExecData][] => {
    const map: Record<string, DailyExecData> = {};
    executions.forEach((e) => {
      const day = e.started_at.slice(0, 10);
      if (!map[day]) map[day] = { total: 0, success: 0, failed: 0 };
      map[day].total++;
      if (e.status === "completed") map[day].success++;
      if (e.status === "failed") map[day].failed++;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  }, [executions]);

  const errorTypes = useMemo(() => {
    const map: Record<string, number> = {};
    steps.filter((s) => s.status === "failed").forEach((s) => { const t = s.node_type || "unknown"; map[t] = (map[t] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [steps]);

  const slowestNodes = useMemo((): SlowestNode[] => {
    const map: Record<string, { total: number; count: number; type: string }> = {};
    steps.filter((s) => s.latency_ms).forEach((s) => {
      const key = `${s.node_id}_${s.node_type}`;
      if (!map[key]) map[key] = { total: 0, count: 0, type: s.node_type };
      map[key].total += s.latency_ms!;
      map[key].count++;
    });
    return Object.entries(map)
      .map(([key, v]) => ({ nodeId: key.split("_")[0], type: v.type, avg: Math.round(v.total / v.count), count: v.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 8);
  }, [steps]);

  return {
    loading, period, setPeriod, fetchData,
    totalExec, successExec, failedExec, errorRate,
    p50, p95, avgLatency, totalTokens, totalCost,
    channelMap, dailyExec, errorTypes, slowestNodes,
  };
}
