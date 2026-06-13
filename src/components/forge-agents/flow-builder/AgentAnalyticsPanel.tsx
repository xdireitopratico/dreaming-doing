/**
 * AgentAnalyticsPanel — Dashboard de métricas do agente
 * Refatorado R57: lógica extraída para useAgentMetrics
 */
import {
  X, TrendingUp, TrendingDown, RefreshCw, Activity, Clock,
  AlertTriangle, Zap, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentMetrics, type Period } from "./hooks/useAgentMetrics";

interface AgentAnalyticsPanelProps {
  flowId: string;
  onClose: () => void;
}

export function AgentAnalyticsPanel({ flowId, onClose }: AgentAnalyticsPanelProps) {
  const m = useAgentMetrics(flowId);
  const maxDailyExec = Math.max(...m.dailyExec.map(([, d]) => d.total), 1);

  return (
    <div className="w-[420px] border-l bg-background flex flex-col shrink-0 max-h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Analytics
        </h3>
        <div className="flex items-center gap-1">
          <div className="flex gap-0.5">
            {(["24h", "7d", "30d", "all"] as Period[]).map((p) => (
              <Badge
                key={p}
                variant={m.period === p ? "default" : "outline"}
                className="cursor-pointer text-[10px] px-1.5 py-0.5"
                onClick={() => m.setPeriod(p)}
              >
                {p === "all" ? "Tudo" : p}
              </Badge>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={m.fetchData} disabled={m.loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${m.loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="border rounded-lg p-2.5 text-center">
              <div className="text-lg font-bold">{m.totalExec}</div>
              <div className="text-[10px] text-muted-foreground">Execuções</div>
            </div>
            <div className="border rounded-lg p-2.5 text-center">
              <div className="text-lg font-bold flex items-center justify-center gap-1">
                {m.errorRate}%
                {Number(m.errorRate) > 10 ? (
                  <TrendingUp className="h-3 w-3 text-destructive" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-emerald-500" />
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">Taxa de erro</div>
            </div>
            <div className="border rounded-lg p-2.5 text-center">
              <div className="text-lg font-bold">{m.avgLatency}ms</div>
              <div className="text-[10px] text-muted-foreground">Latência média</div>
            </div>
          </div>

          {/* Latency percentiles */}
          <div className="border rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-semibold flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Latência
            </h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-sm font-bold">{m.p50}ms</div>
                <div className="text-[10px] text-muted-foreground">p50</div>
              </div>
              <div>
                <div className="text-sm font-bold">{m.p95}ms</div>
                <div className="text-[10px] text-muted-foreground">p95</div>
              </div>
              <div>
                <div className="text-sm font-bold">{m.totalTokens.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">Tokens</div>
              </div>
            </div>
            {m.totalCost > 0 && (
              <div className="text-[10px] text-muted-foreground text-center">
                Custo total: ${m.totalCost.toFixed(4)}
              </div>
            )}
          </div>

          {/* Executions Chart */}
          <div className="border rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-semibold flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" /> Execuções por dia
            </h4>
            {m.dailyExec.length === 0 ? (
              <div className="text-[10px] text-muted-foreground text-center py-4">Sem dados</div>
            ) : (
              <div className="space-y-1">
                {m.dailyExec.map(([day, data]) => (
                  <div key={day} className="flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground w-12 shrink-0">{day.slice(5)}</span>
                    <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden flex">
                      <div className="h-full bg-emerald-500/70 transition-all" style={{ width: `${(data.success / maxDailyExec) * 100}%` }} />
                      <div className="h-full bg-destructive/70 transition-all" style={{ width: `${(data.failed / maxDailyExec) * 100}%` }} />
                    </div>
                    <span className="text-[9px] font-medium w-6 text-right">{data.total}</span>
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-1 text-[9px] text-muted-foreground">
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-emerald-500/70" /> Sucesso</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-destructive/70" /> Erro</span>
                </div>
              </div>
            )}
          </div>

          {/* Channel Breakdown */}
          <div className="border rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-semibold flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" /> Por canal
            </h4>
            {m.channelMap.length === 0 ? (
              <div className="text-[10px] text-muted-foreground text-center py-2">Sem dados</div>
            ) : (
              <div className="space-y-1.5">
                {m.channelMap.map(([channel, count]) => {
                  const pct = m.totalExec > 0 ? ((count / m.totalExec) * 100).toFixed(0) : 0;
                  return (
                    <div key={channel} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] px-1.5 min-w-[60px] text-center">{channel}</Badge>
                      <div className="flex-1 h-3 bg-muted/30 rounded overflow-hidden">
                        <div className="h-full bg-primary/60 rounded transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground w-12 text-right">{count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Error Types */}
          <div className="border rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-semibold flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Erros por tipo de nó
            </h4>
            {m.errorTypes.length === 0 ? (
              <div className="text-[10px] text-emerald-500 text-center py-2">Nenhum erro 🎉</div>
            ) : (
              <div className="space-y-1">
                {m.errorTypes.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between p-1.5 rounded bg-destructive/5 border border-destructive/10">
                    <Badge variant="outline" className="text-[9px] px-1">{type.toUpperCase()}</Badge>
                    <span className="text-[10px] font-medium text-destructive">{count} erro(s)</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Slowest Nodes */}
          <div className="border rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-semibold flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Nós mais lentos
            </h4>
            {m.slowestNodes.length === 0 ? (
              <div className="text-[10px] text-muted-foreground text-center py-2">Sem dados</div>
            ) : (
              <div className="space-y-1">
                {m.slowestNodes.map((n, i) => {
                  const maxAvg = m.slowestNodes[0]?.avg || 1;
                  return (
                    <div key={`${n.nodeId}-${i}`} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] px-1 min-w-[50px] text-center">{n.type.toUpperCase()}</Badge>
                      <div className="flex-1 h-3 bg-muted/30 rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{
                            width: `${(n.avg / maxAvg) * 100}%`,
                            backgroundColor: n.avg > 2000 ? "hsl(var(--destructive))" : n.avg > 500 ? "hsl(var(--primary))" : "hsl(142 76% 36%)",
                          }}
                        />
                      </div>
                      <span className="text-[9px] font-mono w-14 text-right">{n.avg}ms</span>
                      <span className="text-[9px] text-muted-foreground w-8 text-right">×{n.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="border rounded-lg p-3 bg-muted/20 text-center space-y-1">
            <div className="text-[10px] text-muted-foreground">
              {m.successExec} sucesso · {m.failedExec} falhas · {m.totalExec - m.successExec - m.failedExec} outros
            </div>
            <div className="text-[10px] text-muted-foreground">
              Período: {m.period === "all" ? "Todo o histórico" : `Últimos ${m.period}`}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
