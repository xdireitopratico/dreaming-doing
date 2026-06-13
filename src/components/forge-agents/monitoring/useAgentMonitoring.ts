/**
 * useAgentMonitoring — Data fetching + realtime for monitoring dashboard
 * Phase 8: Added status/channel filters, pagination, lifecycle badges
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MonitoringData, AgentHealth, DailyTrend, Anomaly, StatusFilter, ChannelFilter } from "./monitoring-types";

type Period = "1h" | "24h" | "7d" | "30d";

interface MonitoringFilters {
  status: StatusFilter;
  channel: ChannelFilter;
}

export function useAgentMonitoring(period: Period, filters?: MonitoringFilters) {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const statusFilter = filters?.status || "all";
  const channelFilter = filters?.channel || "all";

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const periodDate = useMemo(() => {
    const ms: Record<Period, number> = {
      "1h": 3600_000, "24h": 86400_000, "7d": 7 * 86400_000, "30d": 30 * 86400_000,
    };
    return new Date(Date.now() - ms[period]).toISOString();
  }, [period]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Build exec query with filters applied inline
      const execQueryBase = supabase.from("agent_executions")
        .select("id, flow_id, status, started_at, completed_at, total_tokens_in, total_tokens_out, total_cost_cents, channel, error_message")
        .gte("started_at", periodDate)
        .order("started_at", { ascending: false })
        .limit(1000) as any;

      // Apply optional filters
      let eq = execQueryBase;
      if (statusFilter !== "all") eq = eq.eq("status", statusFilter);
      if (channelFilter !== "all") eq = eq.eq("channel", channelFilter);

      const [flowsRes, execsRes] = await Promise.all([
        supabase.from("agent_flows")
          .select("id, name, status, total_executions, avg_latency_ms, avg_quality_score"),
        eq,
      ]);

      const flows = (flowsRes.data || []) as any[];
      const execs = (execsRes.data || []) as any[];

      const execsByFlow: Record<string, typeof execs> = {};
      execs.forEach(e => {
        if (!execsByFlow[e.flow_id]) execsByFlow[e.flow_id] = [];
        execsByFlow[e.flow_id].push(e);
      });

      const agents: AgentHealth[] = flows.map(f => buildAgentHealth(f, execsByFlow[f.id] || []));

      const totalExecs = execs.length;
      const totalFailed = execs.filter((e: any) => e.status === "failed").length;
      const globalErrorRate = totalExecs > 0 ? (totalFailed / totalExecs) * 100 : 0;
      const allLatencies = execs
        .filter((e: any) => e.started_at && e.completed_at)
        .map((e: any) => new Date(e.completed_at).getTime() - new Date(e.started_at).getTime())
        .sort((a: number, b: number) => a - b);
      const p50 = allLatencies.length > 0 ? allLatencies[Math.floor(allLatencies.length * 0.5)] : 0;
      const p95 = allLatencies.length > 0 ? allLatencies[Math.floor(allLatencies.length * 0.95)] : 0;
      const globalTokens = execs.reduce((s: number, e: any) => s + (e.total_tokens_in || 0) + (e.total_tokens_out || 0), 0);
      const globalCost = execs.reduce((s: number, e: any) => s + ((e.total_cost_cents || 0) / 100), 0);

      const dailyTrend = buildDailyTrend(execs);

      const anomalies: Anomaly[] = [];
      agents.forEach(a => {
        if (a.health === "critical") {
          anomalies.push({ type: "agent_critical", severity: "critical", message: `${a.name}: estado crítico (${a.errorRate.toFixed(0)}% erros)`, agentId: a.id });
        }
      });

      if (mountedRef.current) {
        setData({
          agents: agents.sort((a, b) => {
            const order = { critical: 0, degraded: 1, healthy: 2, inactive: 3 };
            return order[a.health] - order[b.health];
          }),
          kpis: { totalExecs, totalFailed, globalErrorRate, p50, p95, globalTokens, globalCost },
          dailyTrend,
          anomalies,
          errorHotspots: [],
          activeAgents: agents.filter(a => a.health !== "inactive").length,
          totalAgents: agents.length,
        });
      }
    } catch (err) {
      console.error("[Monitoring] fetch error:", err);
    }
    if (mountedRef.current) setLoading(false);
  }, [periodDate, statusFilter, channelFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 5 min
  useEffect(() => {
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Realtime subscription for agent_executions
  useEffect(() => {
    const channel = supabase
      .channel("monitoring-executions")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_executions" }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  return { data, loading, refresh: fetchData };
}

function buildAgentHealth(f: any, agentExecs: any[]): AgentHealth {
  const total = agentExecs.length;
  const failed = agentExecs.filter((e: any) => e.status === "failed").length;
  const errorRate = total > 0 ? (failed / total) * 100 : 0;
  const latencies = agentExecs
    .filter((e: any) => e.started_at && e.completed_at)
    .map((e: any) => new Date(e.completed_at).getTime() - new Date(e.started_at).getTime());
  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length) : 0;
  const tokens = agentExecs.reduce((s: number, e: any) => s + (e.total_tokens_in || 0) + (e.total_tokens_out || 0), 0);
  const cost = agentExecs.reduce((s: number, e: any) => s + ((e.total_cost_cents || 0) / 100), 0);

  const testExecs = agentExecs.filter((e: any) => e.channel === "test").length;
  const prodExecs = total - testExecs;

  let health: "healthy" | "degraded" | "critical" | "inactive" = "inactive";
  if (total > 0) {
    if (errorRate > 25 || avgLatency > 10000) health = "critical";
    else if (errorRate > 10 || avgLatency > 5000) health = "degraded";
    else health = "healthy";
  }

  const dailyTrend = buildDailyTrend(agentExecs);

  return {
    id: f.id,
    name: f.name,
    status: f.status,
    health,
    executions: total,
    errorRate,
    avgLatency,
    tokens,
    cost,
    lastExec: agentExecs[0]?.started_at || null,
    testExecs,
    prodExecs,
    recentErrors: agentExecs
      .filter((e: any) => e.status === "failed")
      .slice(0, 5)
      .map((e: any) => ({ id: e.id, error: e.error_message || "Unknown", at: e.started_at })),
    recentExecs: agentExecs.slice(0, 20).map((e: any) => ({
      id: e.id,
      status: e.status,
      startedAt: e.started_at,
      completedAt: e.completed_at,
      tokens: (e.total_tokens_in || 0) + (e.total_tokens_out || 0),
      cost: (e.total_cost_cents || 0) / 100,
      error: e.error_message,
      channel: e.channel,
      evalScore: e.eval_score ?? null,
      inputPreview: e.input_message ? String(e.input_message).slice(0, 80) : null,
    })),
    dailyTrend,
  };
}

function buildDailyTrend(execs: any[]): DailyTrend[] {
  const dailyMap: Record<string, { total: number; success: number; failed: number; tokens: number; cost: number }> = {};
  execs.forEach((e: any) => {
    const day = e.started_at?.slice(0, 10);
    if (!day) return;
    if (!dailyMap[day]) dailyMap[day] = { total: 0, success: 0, failed: 0, tokens: 0, cost: 0 };
    dailyMap[day].total++;
    if (e.status === "completed") dailyMap[day].success++;
    if (e.status === "failed") dailyMap[day].failed++;
    dailyMap[day].tokens += (e.total_tokens_in || 0) + (e.total_tokens_out || 0);
    dailyMap[day].cost += (e.total_cost_cents || 0) / 100;
  });
  return Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([day, d]) => ({ day, ...d }));
}
