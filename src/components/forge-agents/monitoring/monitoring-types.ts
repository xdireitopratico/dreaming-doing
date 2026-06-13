/**
 * Monitoring types — Phase 8: Enhanced with filters and lifecycle
 */

export type StatusFilter = "all" | "completed" | "failed" | "running" | "paused";
export type ChannelFilter = "all" | "test" | "web" | "whatsapp" | "api";

export interface AgentHealth {
  id: string;
  name: string;
  status: string; // draft | trial | published | archived
  health: "healthy" | "degraded" | "critical" | "inactive";
  executions: number;
  errorRate: number;
  avgLatency: number;
  tokens: number;
  cost: number;
  lastExec: string | null;
  recentErrors: { id: string; error: string; at: string }[];
  recentExecs?: {
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    tokens: number;
    cost: number;
    error: string | null;
    channel: string | null;
    evalScore: number | null;
    inputPreview: string | null;
  }[];
  dailyTrend?: DailyTrend[];
  /** Breakdown: test vs production executions */
  testExecs: number;
  prodExecs: number;
}

export interface Anomaly {
  type: "error_spike" | "latency_spike" | "agent_critical" | "token_spike";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  agentId?: string;
  value?: number;
  baseline?: number;
}

export interface DailyTrend {
  day: string;
  total: number;
  success: number;
  failed: number;
  tokens: number;
  cost: number;
}

export interface MonitoringKpis {
  totalExecs: number;
  totalFailed: number;
  globalErrorRate: number;
  p50: number;
  p95: number;
  globalTokens: number;
  globalCost: number;
}

export interface MonitoringData {
  agents: AgentHealth[];
  kpis: MonitoringKpis;
  dailyTrend: DailyTrend[];
  anomalies: Anomaly[];
  errorHotspots: [string, number][];
  activeAgents: number;
  totalAgents: number;
}
