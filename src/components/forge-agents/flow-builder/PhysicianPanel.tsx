/**
 * PhysicianPanel — Agent health diagnostics UI
 * ROADMAP-03 Phase 6: Post-deploy monitoring, diagnosis, and fix recommendations
 */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X, Stethoscope, Loader2, Heart, AlertTriangle, AlertCircle,
  Zap, Clock, ChevronDown, ChevronRight, ShieldCheck, Activity,
} from "lucide-react";

interface HealthReport {
  flow_id: string;
  agent_name: string;
  status: "healthy" | "degraded" | "critical";
  error_rate: number;
  avg_latency_ms: number;
  total_executions: number;
  top_errors: Array<{ message: string; count: number; node_type: string }>;
  slow_nodes: Array<{ node_id: string; node_type: string; avg_ms: number }>;
  last_check: string;
}

interface Diagnosis {
  id: string;
  category: "model" | "prompt" | "tool" | "config" | "integration" | "performance";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  root_cause: string;
  prescription: string;
  auto_fixable: boolean;
  fix_action?: {
    target_node_id?: string;
  };
}

interface PhysicianReport {
  health: HealthReport;
  diagnoses: Diagnosis[];
  overall_recommendation: string;
  checked_at: string;
}

interface PhysicianPanelProps {
  flowId: string;
  onClose: () => void;
  onHighlightNode?: (nodeId: string | null) => void;
}

const STATUS_CONFIG = {
  healthy: { icon: Heart, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "Saudável" },
  degraded: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", label: "Degradado" },
  critical: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", label: "Crítico" },
};

const SEVERITY_COLORS = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
};

const CATEGORY_ICONS: Record<string, string> = {
  model: "🧠", prompt: "✏️", tool: "🔧", config: "⚙️", integration: "🔌", performance: "⚡",
};

export function PhysicianPanel({ flowId, onClose, onHighlightNode }: PhysicianPanelProps) {
  const [report, setReport] = useState<PhysicianReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDiag, setExpandedDiag] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("prometheus-builder", {
        body: { action: "physician", flow_id: flowId },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setReport(data as PhysicianReport);
    } catch (err) {
      setError((err as Error).message || "Erro ao executar diagnóstico");
    }

    setLoading(false);
  }, [flowId]);

  const statusConfig = report ? STATUS_CONFIG[report.health.status] : null;
  const StatusIcon = statusConfig?.icon || Heart;

  return (
    <div className="w-[340px] border-l border-border bg-card/50 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Physician</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Run Check Button */}
          {!report && !loading && (
            <div className="text-center py-8 space-y-4">
              <Activity className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <div>
                <p className="text-sm font-medium text-foreground">Diagnóstico do Agente</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Analise a saúde do agente, identifique problemas e receba recomendações de correção.
                </p>
              </div>
              <Button onClick={runCheck} className="gap-2">
                <Stethoscope className="h-4 w-4" />
                Executar Diagnóstico
              </Button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="text-center py-8 space-y-3">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Physician analisando...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-xs text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={runCheck}>
                Tentar novamente
              </Button>
            </div>
          )}

          {/* Report */}
          {report && (
            <>
              {/* Status Banner */}
              <div className={`p-3 rounded-lg border ${statusConfig?.bg} ${statusConfig?.border}`}>
                <div className="flex items-center gap-2 mb-2">
                  <StatusIcon className={`h-4 w-4 ${statusConfig?.color}`} />
                  <span className={`text-sm font-semibold ${statusConfig?.color}`}>
                    {statusConfig?.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{report.overall_recommendation}</p>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <div className="text-lg font-bold text-foreground">{report.health.total_executions}</div>
                  <div className="text-[9px] text-muted-foreground">Execuções</div>
                </div>
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <div className={`text-lg font-bold ${report.health.error_rate > 0.1 ? "text-red-400" : "text-emerald-400"}`}>
                    {Math.round(report.health.error_rate * 100)}%
                  </div>
                  <div className="text-[9px] text-muted-foreground">Erros</div>
                </div>
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <div className={`text-lg font-bold ${report.health.avg_latency_ms > 5000 ? "text-amber-400" : "text-foreground"}`}>
                    {report.health.avg_latency_ms > 1000
                      ? `${(report.health.avg_latency_ms / 1000).toFixed(1)}s`
                      : `${report.health.avg_latency_ms}ms`}
                  </div>
                  <div className="text-[9px] text-muted-foreground">Latência</div>
                </div>
              </div>

              {/* Diagnoses */}
              {report.diagnoses.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">Diagnósticos</span>
                    <Badge variant="secondary" className="text-[9px]">{report.diagnoses.length}</Badge>
                  </div>

                  {report.diagnoses.map(diag => {
                    const isExpanded = expandedDiag === diag.id;
                    return (
                      <div key={diag.id} className="rounded-lg border border-border bg-background/50 overflow-hidden">
                        <button
                          onClick={() => {
                            setExpandedDiag(isExpanded ? null : diag.id);
                            if (diag.fix_action?.target_node_id) {
                              onHighlightNode?.(isExpanded ? null : diag.fix_action.target_node_id);
                            }
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                        >
                          <span className="text-sm">{CATEGORY_ICONS[diag.category] || "📋"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-foreground truncate">{diag.title}</div>
                          </div>
                          <Badge variant="outline" className={`text-[8px] ${SEVERITY_COLORS[diag.severity]}`}>
                            {diag.severity}
                          </Badge>
                          {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                        </button>

                        {isExpanded && (
                          <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                            <div>
                              <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Descrição</div>
                              <p className="text-[11px] text-foreground mt-0.5">{diag.description}</p>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Causa Raiz</div>
                              <p className="text-[11px] text-foreground mt-0.5">{diag.root_cause}</p>
                            </div>
                            <div className="p-2 rounded bg-primary/5 border border-primary/10">
                              <div className="text-[9px] font-semibold text-primary uppercase tracking-wider">💊 Prescrição</div>
                              <p className="text-[11px] text-foreground mt-0.5">{diag.prescription}</p>
                            </div>
                            {diag.auto_fixable && (
                              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                                <ShieldCheck className="h-3 w-3" />
                                Auto-fix disponível
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* No issues */}
              {report.diagnoses.length === 0 && (
                <div className="text-center py-4">
                  <ShieldCheck className="h-8 w-8 mx-auto text-emerald-400 mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum problema detectado!</p>
                </div>
              )}

              {/* Re-run */}
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={runCheck}>
                <Stethoscope className="h-3.5 w-3.5" />
                Re-executar diagnóstico
              </Button>

              <div className="text-[9px] text-muted-foreground text-center">
                Última verificação: {new Date(report.checked_at).toLocaleString("pt-BR")}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
