/**
 * TrendChart — Daily execution trend with stacked success/error bars
 */
import { memo, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyTrend } from "./monitoring-types";

interface TrendChartProps {
  data: DailyTrend[];
}

export const TrendChart = memo(function TrendChart({ data }: TrendChartProps) {
  const maxTotal = useMemo(() => Math.max(...data.map(d => d.total), 1), [data]);

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Sem dados de tendência para o período selecionado
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Tendência de Execuções
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {data.map(d => {
            const successPct = (d.success / maxTotal) * 100;
            const failedPct = (d.failed / maxTotal) * 100;
            const errorRate = d.total > 0 ? ((d.failed / d.total) * 100).toFixed(0) : "0";

            return (
              <div key={d.day} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-14 shrink-0 font-mono">
                  {d.day.slice(5)}
                </span>
                <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500/70 transition-all"
                    style={{ width: `${successPct}%` }}
                  />
                  <div
                    className="h-full bg-destructive/70 transition-all"
                    style={{ width: `${failedPct}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium w-8 text-right">{d.total}</span>
                {d.failed > 0 && (
                  <span className="text-[9px] text-destructive w-10 text-right">{errorRate}%err</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 pt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded bg-emerald-500/70" /> Sucesso
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded bg-destructive/70" /> Erro
          </span>
        </div>
      </CardContent>
    </Card>
  );
});
