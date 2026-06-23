// @ts-nocheck
/**
 * ExecutionLogPanel — Trace timeline + real-time logs
 * Mostra execuções do flow com steps detalhados e realtime
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import {
  X,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Pause,
  Loader2,
  Radio,
  Eye,
} from "lucide-react";

interface ExecutionLogPanelProps {
  flowId: string;
  nodes: { id: string; type?: string; data: Record<string, unknown> }[];
  onHighlightNode: (nodeId: string | null) => void;
  onClose: () => void;
}

interface Execution {
  id: string;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_latency_ms: number | null;
  nodes_executed: number | null;
  error_message: string | null;
  session_id: string;
  current_state: string | null;
}

interface Step {
  id: string;
  node_id: string | null;
  node_type: string;
  status: string | null;
  step_order: number;
  started_at: string | null;
  completed_at: string | null;
  latency_ms: number | null;
  input_data: unknown;
  output_data: unknown;
  error_message: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_cents: number | null;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-500", label: "Concluído" },
  failed: { icon: AlertCircle, color: "text-destructive", label: "Falhou" },
  running: { icon: Loader2, color: "text-blue-500", label: "Executando" },
  paused: { icon: Pause, color: "text-amber-500", label: "Pausado" },
  pending: { icon: Clock, color: "text-muted-foreground", label: "Pendente" },
};

export function ExecutionLogPanel({ flowId, nodes, onHighlightNode, onClose }: ExecutionLogPanelProps) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [expandedExecId, setExpandedExecId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [liveMode, setLiveMode] = useState(true);
  const [loading, setLoading] = useState(false);
  ;

  const loadExecutions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("agent_executions")
      .select("id, status, started_at, completed_at, total_latency_ms, nodes_executed, error_message, session_id, current_state")
      .eq("flow_id", flowId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) setExecutions(data);
    if (error) toast({ title: "Erro ao carregar execuções", variant: "destructive" });
    setLoading(false);
  }, [flowId]);

  useEffect(() => { loadExecutions(); }, [loadExecutions]);

  // Polling when Live mode is on (every 10s)
  useEffect(() => {
    if (!liveMode) return;
    const interval = setInterval(() => {
      loadExecutions();
      if (expandedExecId) {
        // Reload steps for expanded execution
        supabase
          .from("agent_execution_steps")
          .select("*")
          .eq("execution_id", expandedExecId)
          .order("step_order")
          .then(({ data }) => { if (data) setSteps(data as Step[]); });
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [liveMode, flowId, expandedExecId, loadExecutions]);

  const loadSteps = async (executionId: string) => {
    if (expandedExecId === executionId) {
      setExpandedExecId(null);
      setSteps([]);
      onHighlightNode(null);
      return;
    }

    const { data } = await supabase
      .from("agent_execution_steps")
      .select("*")
      .eq("execution_id", executionId)
      .order("step_order", { ascending: true });

    setExpandedExecId(executionId);
    setSteps((data as Step[]) || []);
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const getStatusConfig = (status: string | null) => STATUS_CONFIG[status || "pending"] || STATUS_CONFIG.pending;

  return (
    <div className="w-96 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Execuções</h3>
          {liveMode && <Badge variant="secondary" className="text-xs gap-1"><Radio className="h-3 w-3 text-emerald-500 animate-pulse" />Live</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLiveMode(!liveMode)}>
            <Radio className={`h-4 w-4 ${liveMode ? "text-emerald-500" : "text-muted-foreground"}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadExecutions} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {executions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhuma execução encontrada</p>
          )}

          {executions.map((exec) => {
            const cfg = getStatusConfig(exec.status);
            const Icon = cfg.icon;
            const isExpanded = expandedExecId === exec.id;

            return (
              <div key={exec.id} className="border rounded-lg overflow-hidden">
                {/* Execution row */}
                <button
                  className="w-full flex items-center gap-2 p-3 hover:bg-muted/50 text-left transition-colors"
                  onClick={() => loadSteps(exec.id)}
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                  <Icon className={`h-4 w-4 shrink-0 ${cfg.color} ${exec.status === "running" ? "animate-spin" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono truncate">{exec.session_id.slice(0, 12)}…</div>
                    <div className="text-xs text-muted-foreground">{formatTime(exec.started_at)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {exec.total_latency_ms != null && (
                      <div className="text-xs text-muted-foreground">{exec.total_latency_ms}ms</div>
                    )}
                    {exec.nodes_executed != null && (
                      <div className="text-xs text-muted-foreground">{exec.nodes_executed} nós</div>
                    )}
                  </div>
                </button>

                {/* Expanded steps timeline */}
                {isExpanded && (
                  <div className="border-t bg-muted/20 px-3 py-2 space-y-1">
                    {steps.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">Carregando steps…</p>
                    )}
                    {steps.map((step, i) => {
                      const sCfg = getStatusConfig(step.status);
                      const SIcon = sCfg.icon;
                      const nodeName = nodes.find((n) => n.id === step.node_id)?.data?.label as string || step.node_type;

                      return (
                        <div
                          key={step.id}
                          className="flex items-start gap-2 group cursor-pointer hover:bg-muted/50 rounded p-1.5 transition-colors"
                          onMouseEnter={() => onHighlightNode(step.node_id)}
                          onMouseLeave={() => onHighlightNode(null)}
                        >
                          {/* Timeline line */}
                          <div className="flex flex-col items-center">
                            <SIcon className={`h-3.5 w-3.5 ${sCfg.color} ${step.status === "running" ? "animate-spin" : ""}`} />
                            {i < steps.length - 1 && <div className="w-px h-full bg-border mt-1" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-medium">{String(nodeName)}</span>
                              <Badge variant="outline" className="text-[10px] px-1 py-0">{step.node_type}</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              {step.latency_ms != null && <span>{step.latency_ms}ms</span>}
                              {(step.tokens_in || step.tokens_out) && (
                                <span>{step.tokens_in || 0}→{step.tokens_out || 0} tok</span>
                              )}
                              {step.cost_cents != null && step.cost_cents > 0 && (
                                <span>${(step.cost_cents / 100).toFixed(4)}</span>
                              )}
                            </div>
                            {step.error_message && (
                              <p className="text-[10px] text-destructive mt-0.5 truncate">{step.error_message}</p>
                            )}
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => onHighlightNode(step.node_id)}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}

                    {exec.error_message && (
                      <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
                        {exec.error_message}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
