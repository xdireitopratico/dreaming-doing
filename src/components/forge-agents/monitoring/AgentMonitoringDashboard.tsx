/**
 * AgentMonitoringDashboard — Split layout: agent list (left) + detail (right)
 * Phase 8: Added status/channel filters in header
 */
import { useState, useMemo } from "react";
import { Activity, RefreshCw, ArrowLeft, Bot, Filter } from "lucide-react";
import { AgentListPanel } from "./AgentListPanel";
import { AgentDetailPanel } from "./AgentDetailPanel";
import { PrometheusParticles } from "@/components/forge-prometheus/PrometheusParticles";
import { PrometheusThemeToggle } from "@/components/forge-prometheus/PrometheusThemeToggle";
import { useAgentMonitoring } from "./useAgentMonitoring";
import type { MonitoringData, StatusFilter, ChannelFilter } from "./monitoring-types";
import "@/styles/forge-agents-theme.css";

type Period = "1h" | "24h" | "7d" | "30d";

interface Props {
  onBack?: () => void;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "completed", label: "OK" },
  { value: "failed", label: "Erro" },
  { value: "running", label: "Ativo" },
];

const CHANNEL_OPTIONS: { value: ChannelFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "test", label: "🧪 Teste" },
  { value: "web", label: "🌐 Web" },
  { value: "whatsapp", label: "📱 WhatsApp" },
];

export function AgentMonitoringDashboard({ onBack }: Props) {
  const [period, setPeriod] = useState<Period>("24h");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data, loading, refresh } = useAgentMonitoring(period, { status: statusFilter, channel: channelFilter });

  const selectedAgent = useMemo(
    () => data?.agents.find(a => a.id === selectedAgentId) || null,
    [data, selectedAgentId]
  );

  const hasActiveFilters = statusFilter !== "all" || channelFilter !== "all";

  if (loading && !data) {
    return (
      <div className="prometheus-studio flex items-center justify-center h-full">
        <PrometheusParticles />
        <div className="relative z-10 flex items-center gap-3" style={{ color: "var(--ps-cream-40)" }}>
          <RefreshCw className="h-5 w-5 animate-spin" style={{ color: "var(--ps-accent)" }} />
          <span className="text-sm">Carregando monitoramento...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const healthCounts = {
    healthy: data.agents.filter(a => a.health === "healthy").length,
    degraded: data.agents.filter(a => a.health === "degraded").length,
    critical: data.agents.filter(a => a.health === "critical").length,
    inactive: data.agents.filter(a => a.health === "inactive").length,
  };

  return (
    <div className="prometheus-studio relative h-full flex flex-col overflow-hidden">
      <PrometheusParticles />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <header
          className="shrink-0"
          style={{ borderBottom: "1px solid var(--ps-border)" }}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  onClick={onBack}
                  className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:scale-105"
                  style={{ background: "var(--ps-bg-surface)", border: "1px solid var(--ps-border)" }}
                >
                  <ArrowLeft className="w-4 h-4" style={{ color: "var(--ps-cream-60)" }} />
                </button>
              )}
              <Activity className="w-4 h-4" style={{ color: "var(--ps-accent)" }} />
              <h1 className="text-[15px] font-semibold" style={{ color: "var(--ps-cream)" }}>
                Monitoramento
              </h1>
              <div className="flex items-center gap-1.5 ml-2">
                {healthCounts.healthy > 0 && (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(52,211,153,0.1)", color: "var(--ps-green)" }}>
                    🟢 {healthCounts.healthy}
                  </span>
                )}
                {healthCounts.degraded > 0 && (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(251,191,36,0.1)", color: "var(--ps-orange)" }}>
                    🟡 {healthCounts.degraded}
                  </span>
                )}
                {healthCounts.critical > 0 && (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(239,68,68,0.1)", color: "var(--ps-red)" }}>
                    🔴 {healthCounts.critical}
                  </span>
                )}
                {healthCounts.inactive > 0 && (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "var(--ps-bg-surface)", color: "var(--ps-cream-25)" }}>
                    ⚫ {healthCounts.inactive}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Filters toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:scale-105 relative"
                style={{
                  background: showFilters || hasActiveFilters ? "var(--ps-accent-subtle)" : "var(--ps-bg-surface)",
                  border: `1px solid ${hasActiveFilters ? "rgba(59,130,246,0.4)" : "var(--ps-border)"}`,
                }}
              >
                <Filter className="w-3.5 h-3.5" style={{ color: hasActiveFilters ? "var(--ps-accent)" : "var(--ps-cream-60)" }} />
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ background: "var(--ps-accent)" }} />
                )}
              </button>

              {/* Period selector */}
              <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--ps-border)" }}>
                {(["1h", "24h", "7d", "30d"] as Period[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className="px-2.5 py-1 text-[10px] font-semibold transition-all"
                    style={{
                      background: period === p ? "var(--ps-accent-subtle)" : "transparent",
                      color: period === p ? "var(--ps-accent)" : "var(--ps-cream-40)",
                      borderRight: "1px solid var(--ps-border)",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={refresh}
                disabled={loading}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:scale-105"
                style={{ background: "var(--ps-bg-surface)", border: "1px solid var(--ps-border)" }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} style={{ color: "var(--ps-accent)" }} />
              </button>
              <PrometheusThemeToggle />
            </div>
          </div>

          {/* Filter bar */}
          {showFilters && (
            <div className="flex items-center gap-4 px-4 py-2" style={{ background: "rgba(0,0,0,0.15)", borderTop: "1px solid var(--ps-border)" }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold" style={{ color: "var(--ps-cream-40)" }}>Status:</span>
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--ps-border)" }}>
                  {STATUS_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setStatusFilter(o.value)}
                      className="px-2 py-0.5 text-[9px] font-semibold transition-all"
                      style={{
                        background: statusFilter === o.value ? "var(--ps-accent-subtle)" : "transparent",
                        color: statusFilter === o.value ? "var(--ps-accent)" : "var(--ps-cream-40)",
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold" style={{ color: "var(--ps-cream-40)" }}>Canal:</span>
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--ps-border)" }}>
                  {CHANNEL_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setChannelFilter(o.value)}
                      className="px-2 py-0.5 text-[9px] font-semibold transition-all"
                      style={{
                        background: channelFilter === o.value ? "var(--ps-accent-subtle)" : "transparent",
                        color: channelFilter === o.value ? "var(--ps-accent)" : "var(--ps-cream-40)",
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={() => { setStatusFilter("all"); setChannelFilter("all"); }}
                  className="text-[9px] font-semibold px-2 py-0.5 rounded"
                  style={{ color: "var(--ps-accent)", background: "var(--ps-accent-subtle)" }}
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </header>

        {/* Body — split layout */}
        <div className="flex flex-1 overflow-hidden">
          <AgentListPanel
            agents={data.agents}
            selectedId={selectedAgentId}
            onSelect={setSelectedAgentId}
            activeCount={data.activeAgents}
            totalCount={data.totalAgents}
          />

          <div className="flex-1 overflow-y-auto" style={{ borderLeft: "1px solid var(--ps-border)" }}>
            {selectedAgent ? (
              <AgentDetailPanel agent={selectedAgent} period={period} />
            ) : (
              <FleetOverview data={data} onSelectAgent={setSelectedAgentId} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components kept inline (small, tightly coupled) ---

function FleetOverview({ data, onSelectAgent }: { data: MonitoringData; onSelectAgent: (id: string) => void }) {
  const { kpis, agents, dailyTrend } = data;

  return (
    <div className="p-5 space-y-6">
      <div>
        <h2 className="text-[13px] font-semibold mb-3" style={{ color: "var(--ps-cream-60)" }}>
          Visão Geral do Ecossistema
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FleetKpi label="Execuções" value={kpis.totalExecs.toLocaleString()} sub="no período" color="var(--ps-accent)" />
          <FleetKpi
            label="Taxa de Sucesso"
            value={kpis.totalExecs > 0 ? `${(100 - kpis.globalErrorRate).toFixed(1)}%` : "—"}
            sub={`${kpis.totalFailed} falhas`}
            color={kpis.globalErrorRate > 10 ? "var(--ps-red)" : "var(--ps-green)"}
          />
          <FleetKpi label="Latência p50" value={kpis.p50 > 0 ? `${kpis.p50}ms` : "—"} sub={`p95: ${kpis.p95}ms`} color="var(--ps-accent)" />
          <FleetKpi label="Tokens Consumidos" value={kpis.globalTokens.toLocaleString()} sub={`$${kpis.globalCost.toFixed(4)} custo`} color="var(--ps-purple)" />
        </div>
      </div>

      {dailyTrend.length > 0 && (
        <div>
          <h3 className="text-[12px] font-semibold mb-3" style={{ color: "var(--ps-cream-60)" }}>
            Tendência Global de Execuções
          </h3>
          <MiniBarChart data={dailyTrend} />
        </div>
      )}

      <div>
        <h3 className="text-[12px] font-semibold mb-3" style={{ color: "var(--ps-cream-60)" }}>
          Comparativo por Agente
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {agents.map(agent => {
            const lifecycleColor = agent.status === "published" ? "var(--ps-green)"
              : agent.status === "trial" ? "var(--ps-orange)" : "var(--ps-cream-25)";
            const lifecycleLabel = agent.status === "published" ? "Produção"
              : agent.status === "trial" ? "Trial" : agent.status === "draft" ? "Rascunho" : agent.status;
            return (
              <button
                key={agent.id}
                onClick={() => onSelectAgent(agent.id)}
                className="flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:scale-[1.01]"
                style={{ background: "var(--ps-bg-surface)", border: "1px solid var(--ps-border)" }}
              >
                <HealthDot health={agent.health} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-[12px] font-medium truncate" style={{ color: "var(--ps-cream-80)" }}>
                      {agent.name}
                    </div>
                    <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: `${lifecycleColor}15`, color: lifecycleColor, border: `1px solid ${lifecycleColor}30` }}>
                      {lifecycleLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px]" style={{ color: "var(--ps-cream-40)" }}>
                    <span>{agent.executions} exec</span>
                    <span style={{ color: agent.errorRate > 10 ? "var(--ps-red)" : "var(--ps-green)" }}>
                      {(100 - agent.errorRate).toFixed(0)}% ok
                    </span>
                    {agent.avgLatency > 0 && <span>{agent.avgLatency}ms</span>}
                    {agent.cost > 0 && <span className="font-mono">${agent.cost.toFixed(3)}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bot className="w-10 h-10 mb-3" style={{ color: "var(--ps-cream-15)" }} />
          <p className="text-[13px]" style={{ color: "var(--ps-cream-40)" }}>Nenhum agente criado ainda</p>
          <p className="text-[11px] mt-1" style={{ color: "var(--ps-cream-25)" }}>
            Execute testes no painel de teste para ver métricas aqui
          </p>
        </div>
      )}
    </div>
  );
}

function FleetKpi({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--ps-bg-surface)", border: "1px solid var(--ps-border)" }}
    >
      <div className="text-[10px] font-medium mb-1" style={{ color: "var(--ps-cream-40)" }}>{label}</div>
      <div className="text-[22px] font-bold font-mono" style={{ color }}>{value}</div>
      <div className="text-[9px] mt-0.5" style={{ color: "var(--ps-cream-25)" }}>{sub}</div>
    </div>
  );
}

export function HealthDot({ health, size = 10 }: { health: string; size?: number }) {
  const colors: Record<string, string> = {
    healthy: "var(--ps-green)",
    degraded: "var(--ps-orange)",
    critical: "var(--ps-red)",
    inactive: "var(--ps-cream-25)",
  };
  const c = colors[health] || colors.inactive;
  return (
    <div
      className="rounded-full shrink-0"
      style={{
        width: size, height: size,
        background: c,
        boxShadow: health === "critical" ? `0 0 8px ${c}` : undefined,
      }}
    />
  );
}

export function MiniBarChart({ data }: { data: { day: string; total: number; success: number; failed: number }[] }) {
  const maxTotal = Math.max(...data.map(d => d.total), 1);

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--ps-bg-surface)", border: "1px solid var(--ps-border)" }}
    >
      <div className="flex items-end gap-1" style={{ height: 80 }}>
        {data.map(d => {
          const successH = (d.success / maxTotal) * 100;
          const failedH = (d.failed / maxTotal) * 100;
          return (
            <div key={d.day} className="flex-1 flex flex-col justify-end gap-px group relative" title={`${d.day}: ${d.total} exec (${d.failed} erros)`}>
              {d.failed > 0 && (
                <div className="rounded-t-sm" style={{ height: `${failedH}%`, minHeight: d.failed > 0 ? 2 : 0, background: "var(--ps-red)", opacity: 0.7 }} />
              )}
              <div className="rounded-b-sm" style={{ height: `${successH}%`, minHeight: d.success > 0 ? 2 : 0, background: "var(--ps-accent)", opacity: 0.6 }} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-[8px] font-mono" style={{ color: "var(--ps-cream-25)" }}>
        <span>{data[0]?.day.slice(5)}</span>
        <span>{data[data.length - 1]?.day.slice(5)}</span>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px]" style={{ color: "var(--ps-cream-40)" }}>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm" style={{ background: "var(--ps-accent)", opacity: 0.6 }} /> Sucesso
        </span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm" style={{ background: "var(--ps-red)", opacity: 0.7 }} /> Erro
        </span>
      </div>
    </div>
  );
}
