/**
 * AgentDetailPanel — Right panel showing selected agent's metrics
 * Phase 8: 20 recent execs, test vs prod breakdown, eval scores, cost column
 */
import { memo, useState } from "react";
import {
  Zap, Clock, Cpu, DollarSign, AlertTriangle, CheckCircle2, XCircle, Activity,
  FlaskConical, Globe, BarChart3,
} from "lucide-react";
import { HealthDot, MiniBarChart } from "./AgentMonitoringDashboard";
import type { AgentHealth } from "./monitoring-types";
import { PhysicianConfigPanel } from "./PhysicianConfigPanel";
import { HealingHistoryPanel } from "./HealingHistoryPanel";

interface Props {
  agent: AgentHealth;
  period: string;
}

const HEALTH_LABELS: Record<string, { label: string; color: string }> = {
  healthy: { label: "Saudável", color: "var(--ps-green)" },
  degraded: { label: "Degradado", color: "var(--ps-orange)" },
  critical: { label: "Crítico", color: "var(--ps-red)" },
  inactive: { label: "Inativo", color: "var(--ps-cream-25)" },
};

const LIFECYCLE_LABELS: Record<string, { label: string; color: string }> = {
  trial: { label: "Trial", color: "var(--ps-orange)" },
  published: { label: "Produção", color: "var(--ps-green)" },
  draft: { label: "Rascunho", color: "var(--ps-cream-40)" },
  archived: { label: "Arquivado", color: "var(--ps-cream-25)" },
};

export const AgentDetailPanel = memo(function AgentDetailPanel({ agent, period }: Props) {
  const healthCfg = HEALTH_LABELS[agent.health] || HEALTH_LABELS.inactive;
  const lifecycleCfg = LIFECYCLE_LABELS[agent.status] || LIFECYCLE_LABELS.draft;
  const successRate = agent.executions > 0 ? (100 - agent.errorRate).toFixed(1) : "—";
  const [execFilter, setExecFilter] = useState<"all" | "test" | "prod">("all");

  const filteredExecs = (agent.recentExecs || []).filter(e => {
    if (execFilter === "test") return e.channel === "test";
    if (execFilter === "prod") return e.channel !== "test";
    return true;
  });

  return (
    <div className="p-5 space-y-5">
      {/* Agent header */}
      <div className="flex items-center gap-3">
        <HealthDot health={agent.health} size={14} />
        <div>
          <h2 className="text-[16px] font-bold" style={{ color: "var(--ps-cream)" }}>
            {agent.name}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${healthCfg.color}20`, color: healthCfg.color, border: `1px solid ${healthCfg.color}40` }}>
              {healthCfg.label}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${lifecycleCfg.color}15`, color: lifecycleCfg.color, border: `1px solid ${lifecycleCfg.color}30` }}>
              {lifecycleCfg.label}
            </span>
            {agent.lastExec && (
              <span className="text-[9px]" style={{ color: "var(--ps-cream-25)" }}>
                Última exec: {new Date(agent.lastExec).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Agent KPIs — 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AgentKpi icon={Zap} label="Execuções" value={agent.executions.toLocaleString()} color="var(--ps-accent)" />
        <AgentKpi
          icon={CheckCircle2}
          label="Taxa de Sucesso"
          value={`${successRate}%`}
          color={agent.errorRate > 10 ? "var(--ps-red)" : "var(--ps-green)"}
        />
        <AgentKpi
          icon={Clock}
          label="Latência Média"
          value={agent.avgLatency > 0 ? `${agent.avgLatency}ms` : "—"}
          color={agent.avgLatency > 5000 ? "var(--ps-orange)" : "var(--ps-accent)"}
        />
        <AgentKpi
          icon={Cpu}
          label="Tokens"
          value={agent.tokens > 1000 ? `${(agent.tokens / 1000).toFixed(1)}k` : agent.tokens.toString()}
          sub={`$${agent.cost.toFixed(4)}`}
          color="var(--ps-purple)"
        />
      </div>

      {/* Test vs Production breakdown */}
      {agent.executions > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--ps-cream-40)" }}>
            <FlaskConical className="w-3 h-3" style={{ color: "var(--ps-orange)" }} />
            <span>{agent.testExecs} teste{agent.testExecs !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--ps-bg-surface)" }}>
            {agent.executions > 0 && (
              <div className="h-full rounded-full" style={{
                width: `${(agent.prodExecs / agent.executions) * 100}%`,
                background: "var(--ps-green)",
                opacity: 0.7,
              }} />
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--ps-cream-40)" }}>
            <Globe className="w-3 h-3" style={{ color: "var(--ps-green)" }} />
            <span>{agent.prodExecs} produção</span>
          </div>
        </div>
      )}

      {/* Execution trend chart */}
      {agent.dailyTrend && agent.dailyTrend.length > 0 && (
        <div>
          <h3 className="text-[12px] font-semibold mb-2" style={{ color: "var(--ps-cream-60)" }}>
            Tendência de Execuções ({period})
          </h3>
          <MiniBarChart data={agent.dailyTrend} />
        </div>
      )}

      {/* Recent executions table with filter */}
      {agent.recentExecs && agent.recentExecs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--ps-cream-60)" }}>
              Últimas Execuções
            </h3>
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--ps-border)" }}>
              {([
                { key: "all" as const, label: "Todas" },
                { key: "test" as const, label: "Teste" },
                { key: "prod" as const, label: "Produção" },
              ]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setExecFilter(f.key)}
                  className="px-2 py-0.5 text-[9px] font-semibold transition-all"
                  style={{
                    background: execFilter === f.key ? "var(--ps-accent-subtle)" : "transparent",
                    color: execFilter === f.key ? "var(--ps-accent)" : "var(--ps-cream-40)",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--ps-border)" }}
          >
            <table className="w-full text-[10px]">
              <thead>
                <tr style={{ background: "var(--ps-bg-surface)" }}>
                  <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--ps-cream-40)" }}>Status</th>
                  <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--ps-cream-40)" }}>Quando</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: "var(--ps-cream-40)" }}>Duração</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: "var(--ps-cream-40)" }}>Tokens</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: "var(--ps-cream-40)" }}>Custo</th>
                  <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--ps-cream-40)" }}>Canal</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: "var(--ps-cream-40)" }}>Eval</th>
                </tr>
              </thead>
              <tbody>
                {filteredExecs.map((exec, i) => {
                  const duration = exec.startedAt && exec.completedAt
                    ? `${((new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime()) / 1000).toFixed(1)}s`
                    : "—";
                  const channelLabel = exec.channel === "test" ? "🧪 Teste"
                    : exec.channel === "whatsapp" ? "📱 WhatsApp"
                    : exec.channel === "web" ? "🌐 Web"
                    : exec.channel || "—";
                  return (
                    <tr
                      key={exec.id}
                      style={{
                        borderTop: i > 0 ? "1px solid var(--ps-border)" : undefined,
                        background: exec.status === "failed" ? "rgba(239,68,68,0.03)" : undefined,
                      }}
                    >
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          {exec.status === "completed" ? (
                            <CheckCircle2 className="w-3 h-3" style={{ color: "var(--ps-green)" }} />
                          ) : exec.status === "failed" ? (
                            <XCircle className="w-3 h-3" style={{ color: "var(--ps-red)" }} />
                          ) : (
                            <Activity className="w-3 h-3 animate-pulse" style={{ color: "var(--ps-accent)" }} />
                          )}
                          <span style={{
                            color: exec.status === "failed" ? "var(--ps-red)"
                              : exec.status === "completed" ? "var(--ps-green)"
                              : "var(--ps-accent)",
                          }}>
                            {exec.status === "completed" ? "OK" : exec.status === "failed" ? "Erro" : exec.status}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--ps-cream-40)" }}>
                        {new Date(exec.startedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--ps-cream-60)" }}>
                        {duration}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--ps-cream-60)" }}>
                        {exec.tokens > 0 ? exec.tokens.toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--ps-cream-60)" }}>
                        {exec.cost > 0 ? `$${exec.cost.toFixed(4)}` : "—"}
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--ps-cream-25)" }}>
                        {channelLabel}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: exec.evalScore != null && exec.evalScore >= 0.7 ? "var(--ps-green)" : exec.evalScore != null ? "var(--ps-orange)" : "var(--ps-cream-25)" }}>
                        {exec.evalScore != null ? `${(exec.evalScore * 100).toFixed(0)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
                {filteredExecs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-[10px]" style={{ color: "var(--ps-cream-25)" }}>
                      Nenhuma execução neste filtro
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent errors */}
      {agent.recentErrors.length > 0 && (
        <div>
          <h3 className="text-[12px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--ps-red)" }}>
            <AlertTriangle className="w-3.5 h-3.5" />
            Erros Recentes
          </h3>
          <div className="space-y-1.5">
            {agent.recentErrors.map(err => (
              <div
                key={err.id}
                className="px-3 py-2 rounded-lg text-[10px]"
                style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.1)" }}
              >
                <span className="font-mono" style={{ color: "var(--ps-red)" }}>{err.error.slice(0, 120)}</span>
                <span className="ml-2" style={{ color: "var(--ps-cream-25)" }}>
                  {new Date(err.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {agent.executions === 0 && (
        <div className="flex flex-col items-center py-12 text-center">
          <Activity className="w-8 h-8 mb-3" style={{ color: "var(--ps-cream-15)" }} />
          <p className="text-[12px]" style={{ color: "var(--ps-cream-40)" }}>
            Este agente ainda não tem execuções
          </p>
          <p className="text-[10px] mt-1" style={{ color: "var(--ps-cream-25)" }}>
            Use o painel de teste ou o Playground para gerar execuções
          </p>
        </div>
      )}

      {/* Physician Auto-Heal */}
      <PhysicianConfigPanel flowId={agent.id} flowName={agent.name} />
      <HealingHistoryPanel flowId={agent.id} />
    </div>
  );
});

function AgentKpi({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-3.5"
      style={{ background: "var(--ps-bg-surface)", border: "1px solid var(--ps-border)" }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] font-medium" style={{ color: "var(--ps-cream-40)" }}>{label}</span>
      </div>
      <div className="text-[20px] font-bold font-mono" style={{ color }}>{value}</div>
      {sub && <div className="text-[9px] mt-0.5 font-mono" style={{ color: "var(--ps-cream-25)" }}>{sub}</div>}
    </div>
  );
}
