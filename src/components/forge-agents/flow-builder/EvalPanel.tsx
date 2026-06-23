// @ts-nocheck
/**
 * EvalPanel — Quality metrics, version comparison, cost analysis
 * Métricas p50/p95, taxa de erro, custo, comparação de versões
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  X,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  BarChart3,
  DollarSign,
  Zap,
  Target,
  ArrowRight,
} from "lucide-react";

interface EvalPanelProps {
  flowId: string;
  onClose: () => void;
}

interface VersionMetrics {
  version: number;
  total: number;
  completed: number;
  failed: number;
  errorRate: number;
  latencies: number[];
  p50: number;
  p95: number;
  avgCost: number;
  totalCost: number;
  avgTokensIn: number;
  avgTokensOut: number;
  avgQuality: number | null;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function EvalPanel({ flowId, onClose }: EvalPanelProps) {
  const [metrics, setMetrics] = useState<VersionMetrics[]>([]);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<"24h" | "7d" | "30d">("7d");

  const loadMetrics = useCallback(async () => {
    setLoading(true);

    const since = new Date();
    if (period === "24h") since.setHours(since.getHours() - 24);
    else if (period === "7d") since.setDate(since.getDate() - 7);
    else since.setDate(since.getDate() - 30);

    const { data: executions } = await supabase
      .from("agent_executions")
      .select("id, status, flow_version, total_latency_ms, total_cost_cents, total_tokens_in, total_tokens_out, quality_score")
      .eq("flow_id", flowId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(500);

    if (!executions || executions.length === 0) {
      setMetrics([]);
      setLoading(false);
      return;
    }

    // Group by version
    const byVersion = new Map<number, typeof executions>();
    for (const exec of executions) {
      const v = exec.flow_version;
      if (!byVersion.has(v)) byVersion.set(v, []);
      byVersion.get(v)!.push(exec);
    }

    const result: VersionMetrics[] = [];
    for (const [version, execs] of byVersion) {
      const completed = execs.filter((e) => e.status === "completed").length;
      const failed = execs.filter((e) => e.status === "failed").length;
      const latencies = execs
        .filter((e) => e.total_latency_ms != null)
        .map((e) => e.total_latency_ms!);
      const costs = execs.filter((e) => e.total_cost_cents != null);
      const qualities = execs.filter((e) => e.quality_score != null);

      result.push({
        version,
        total: execs.length,
        completed,
        failed,
        errorRate: execs.length > 0 ? (failed / execs.length) * 100 : 0,
        latencies,
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        avgCost: costs.length > 0 ? costs.reduce((a, e) => a + (e.total_cost_cents || 0), 0) / costs.length : 0,
        totalCost: costs.reduce((a, e) => a + (e.total_cost_cents || 0), 0),
        avgTokensIn: execs.length > 0 ? execs.reduce((a, e) => a + (e.total_tokens_in || 0), 0) / execs.length : 0,
        avgTokensOut: execs.length > 0 ? execs.reduce((a, e) => a + (e.total_tokens_out || 0), 0) / execs.length : 0,
        avgQuality: qualities.length > 0 ? qualities.reduce((a, e) => a + (e.quality_score || 0), 0) / qualities.length : null,
      });
    }

    result.sort((a, b) => b.version - a.version);
    setMetrics(result);

    // BUG 123 FIX: Always update compareA/B when metrics load (no stale closure)
    if (result.length >= 2) {
      setCompareA(String(result[0].version));
      setCompareB(String(result[1].version));
    } else if (result.length === 1) {
      setCompareA(String(result[0].version));
      setCompareB("");
    }

    setLoading(false);
  }, [flowId, period]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  const metricA = metrics.find((m) => String(m.version) === compareA);
  const metricB = metrics.find((m) => String(m.version) === compareB);

  const allExecs = metrics.reduce((a, m) => a + m.total, 0);
  const allErrors = metrics.reduce((a, m) => a + m.failed, 0);
  const allLatencies = metrics.flatMap((m) => m.latencies);
  const globalP50 = percentile(allLatencies, 50);
  const globalP95 = percentile(allLatencies, 95);
  const totalCost = metrics.reduce((a, m) => a + m.totalCost, 0);

  const DeltaIndicator = ({ current, previous, inverted = false }: { current: number; previous: number; inverted?: boolean }) => {
    if (previous === 0) return null;
    const delta = ((current - previous) / previous) * 100;
    const isGood = inverted ? delta < 0 : delta > 0;
    return (
      <span className={`text-[10px] flex items-center gap-0.5 ${isGood ? "text-emerald-500" : "text-destructive"}`}>
        {isGood ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {Math.abs(delta).toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="w-96 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Avaliação</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadMetrics} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Period selector */}
      <div className="px-4 pt-3 pb-2 flex gap-1">
        {(["24h", "7d", "30d"] as const).map((p) => (
          <Button
            key={p}
            variant={period === p ? "default" : "outline"}
            size="sm"
            className="text-xs flex-1 h-7"
            onClick={() => setPeriod(p)}
          >
            {p}
          </Button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Global metrics */}
          <div className="grid grid-cols-2 gap-2">
            <div className="border rounded-lg p-3 text-center">
              <Zap className="h-4 w-4 mx-auto mb-1 text-primary" />
              <div className="text-lg font-bold">{allExecs}</div>
              <div className="text-[10px] text-muted-foreground">Execuções</div>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <Target className="h-4 w-4 mx-auto mb-1 text-destructive" />
              <div className="text-lg font-bold">{allExecs > 0 ? ((allErrors / allExecs) * 100).toFixed(1) : 0}%</div>
              <div className="text-[10px] text-muted-foreground">Taxa de erro</div>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <div className="text-lg font-bold">{globalP50}ms</div>
              <div className="text-[10px] text-muted-foreground">Latência p50</div>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <div className="text-lg font-bold">{globalP95}ms</div>
              <div className="text-[10px] text-muted-foreground">Latência p95</div>
            </div>
          </div>

          {/* Cost */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium">Custo total</span>
            </div>
            <div className="text-2xl font-bold">${(totalCost / 100).toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">
              Média: ${allExecs > 0 ? ((totalCost / allExecs) / 100).toFixed(4) : "0.00"}/execução
            </div>
          </div>

          {/* Version comparison */}
          {metrics.length >= 2 && (
            <div className="space-y-3">
              <Label className="text-xs font-medium">Comparação A/B</Label>
              <div className="flex items-center gap-2">
                <Select value={compareA} onValueChange={setCompareA}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {metrics.map((m) => (
                      <SelectItem key={m.version} value={String(m.version)}>v{m.version}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={compareB} onValueChange={setCompareB}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {metrics.map((m) => (
                      <SelectItem key={m.version} value={String(m.version)}>v{m.version}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {metricA && metricB && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Métrica</th>
                        <th className="text-right p-2 font-medium">v{metricA.version}</th>
                        <th className="text-right p-2 font-medium">v{metricB.version}</th>
                        <th className="text-right p-2 font-medium">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-2">Execuções</td>
                        <td className="text-right p-2">{metricA.total}</td>
                        <td className="text-right p-2">{metricB.total}</td>
                        <td className="text-right p-2"><DeltaIndicator current={metricA.total} previous={metricB.total} /></td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-2">Erro %</td>
                        <td className="text-right p-2">{metricA.errorRate.toFixed(1)}%</td>
                        <td className="text-right p-2">{metricB.errorRate.toFixed(1)}%</td>
                        <td className="text-right p-2"><DeltaIndicator current={metricA.errorRate} previous={metricB.errorRate} inverted /></td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-2">p50 (ms)</td>
                        <td className="text-right p-2">{metricA.p50}</td>
                        <td className="text-right p-2">{metricB.p50}</td>
                        <td className="text-right p-2"><DeltaIndicator current={metricA.p50} previous={metricB.p50} inverted /></td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-2">p95 (ms)</td>
                        <td className="text-right p-2">{metricA.p95}</td>
                        <td className="text-right p-2">{metricB.p95}</td>
                        <td className="text-right p-2"><DeltaIndicator current={metricA.p95} previous={metricB.p95} inverted /></td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-2">Custo médio</td>
                        <td className="text-right p-2">${(metricA.avgCost / 100).toFixed(4)}</td>
                        <td className="text-right p-2">${(metricB.avgCost / 100).toFixed(4)}</td>
                        <td className="text-right p-2"><DeltaIndicator current={metricA.avgCost} previous={metricB.avgCost} inverted /></td>
                      </tr>
                      <tr>
                        <td className="p-2">Tokens (in/out)</td>
                        <td className="text-right p-2">{Math.round(metricA.avgTokensIn)}/{Math.round(metricA.avgTokensOut)}</td>
                        <td className="text-right p-2">{Math.round(metricB.avgTokensIn)}/{Math.round(metricB.avgTokensOut)}</td>
                        <td className="text-right p-2">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Per-version breakdown */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Por versão</Label>
            {metrics.map((m) => (
              <div key={m.version} className="border rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">v{m.version}</Badge>
                  <span className="text-xs text-muted-foreground">{m.total} execuções</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mt-2">
                  <div>
                    <div className="text-sm font-semibold">{m.p50}ms</div>
                    <div className="text-[10px] text-muted-foreground">p50</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{m.errorRate.toFixed(1)}%</div>
                    <div className="text-[10px] text-muted-foreground">erro</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold">${(m.avgCost / 100).toFixed(3)}</div>
                    <div className="text-[10px] text-muted-foreground">custo</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {metrics.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground text-center py-8">Sem dados de execução no período selecionado</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
