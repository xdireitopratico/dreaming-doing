// @ts-nocheck
/**
 * ExecutionLogPanel — Trace timeline + real-time logs
 * Mostra execuções do flow com steps detalhados, busca, e visualização I/O
 *
 * FASE 4.2: Step tree com cores por tipo de nó, busca, detalhes expansíveis
 * FASE 4.3: ExecutionDataViewer integrado para inspecionar input/output
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import {
  X, RefreshCw, ChevronDown, ChevronRight, Clock, AlertCircle,
  CheckCircle2, Pause, Loader2, Radio, Search, Filter,
} from "lucide-react";
import { ExecutionDataViewer } from "./ExecutionDataViewer";

/* ── Node type color map (sincronizado com FlowCanvas MINIMAP_COLORS) ── */
const NODE_COLORS: Record<string, string> = {
  trigger: "#22c55e", llm: "#fbbf24", tool: "#eab308",
  condition: "#6b7280", output_guard: "#f59e0b", stt: "#a855f7",
  tts: "#f97316", rag_search: "#b45309", hitl: "#ef4444",
  loop: "#6b7280", switch: "#6366f1", memory: "#ec4899",
  delay: "#9ca3af", sub_flow: "#1f2937", transformer: "#06b6d4",
  error_handler: "#dc2626", vision: "#7c3aed",
};

function getNodeColor(type: string): string {
  return NODE_COLORS[type] || "#94a3b8";
}

/* ── Types ── */
interface ExecutionLogPanelProps {
  flowId: string;
  nodes: { id: string; type?: string; data: Record<string, unknown> }[];
  onHighlightNode: (nodeId: string | null) => void;
  onClose: () => void;
}

interface Execution {
  id: string; status: string | null; started_at: string | null;
  completed_at: string | null; total_latency_ms: number | null;
  nodes_executed: number | null; error_message: string | null;
  session_id: string; current_state: string | null;
}

interface Step {
  id: string; node_id: string | null; node_type: string;
  status: string | null; step_order: number;
  started_at: string | null; completed_at: string | null;
  latency_ms: number | null;
  input_data: unknown; output_data: unknown;
  error_message: string | null;
  tokens_in: number | null; tokens_out: number | null;
  cost_cents: number | null;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-500", label: "Concluído" },
  failed:    { icon: AlertCircle, color: "text-destructive", label: "Falhou" },
  running:   { icon: Loader2, color: "text-blue-500", label: "Executando" },
  paused:    { icon: Pause, color: "text-amber-500", label: "Pausado" },
  pending:   { icon: Clock, color: "text-muted-foreground", label: "Pendente" },
};

export function ExecutionLogPanel({ flowId, nodes, onHighlightNode, onClose }: ExecutionLogPanelProps) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [expandedExecId, setExpandedExecId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  /* ── Load executions ── */
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

  /* ── Polling live mode ── */
  useEffect(() => {
    if (!liveMode) return;
    const interval = setInterval(() => {
      loadExecutions();
      if (expandedExecId) {
        supabase
          .from("agent_execution_steps")
          .select("*")
          .eq("execution_id", expandedExecId)
          .order("step_order")
          .then(({ data }) => { if (data) setSteps(data as Step[]); });
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [liveMode, expandedExecId, loadExecutions]);

  /* ── Load steps for an execution ── */
  const loadSteps = async (executionId: string) => {
    if (expandedExecId === executionId) {
      setExpandedExecId(null);
      setSteps([]);
      setExpandedStepId(null);
      onHighlightNode(null);
      return;
    }

    const { data } = await supabase
      .from("agent_execution_steps")
      .select("*")
      .eq("execution_id", executionId)
      .order("step_order", { ascending: true });

    setExpandedExecId(executionId);
    setExpandedStepId(null);
    setSteps((data as Step[]) || []);
  };

  /* ── Helpers ── */
  const formatTime = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const getStatusConfig = (status: string | null) => STATUS_CONFIG[status || "pending"] || STATUS_CONFIG.pending;

  const formatLatency = (ms: number | null) => {
    if (ms == null) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  /* ── Filtered steps ── */
  const filteredSteps = useMemo(() => {
    if (!search) return steps;
    const q = search.toLowerCase();
    return steps.filter((s) => {
      const nodeName = nodes.find((n) => n.id === s.node_id)?.data?.label as string || "";
      return nodeName.toLowerCase().includes(q) || s.node_type.toLowerCase().includes(q);
    });
  }, [steps, search, nodes]);

  return (
    <div className="w-96 border-l bg-background flex flex-col h-full" style={{ borderColor: 'var(--ps-border)' }}>
      {/* ── Header ── */}
      <div className="px-3 py-2.5 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--ps-border)' }}>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" style={{ color: 'var(--ps-accent)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ps-cream-80)' }}>Execuções</h3>
          {liveMode && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-1 font-normal">
              <Radio className="h-2.5 w-2.5 text-emerald-500 animate-pulse" />Live
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setLiveMode(!liveMode)} title="Live mode">
            <Radio className={`h-3.5 w-3.5 ${liveMode ? "text-emerald-500" : ""}`} style={{ color: liveMode ? undefined : 'var(--ps-cream-25)' }} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={loadExecutions} disabled={loading} title="Recarregar">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} style={{ color: 'var(--ps-cream-60)' }} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} title="Fechar">
            <X className="h-3.5 w-3.5" style={{ color: 'var(--ps-cream-60)' }} />
          </Button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--ps-border)' }}>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3" style={{ color: 'var(--ps-cream-25)' }} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nó…"
            className="h-7 text-[10px] pl-7 pr-2"
            style={{
              background: 'var(--ps-bg-deep)',
              borderColor: 'var(--ps-border)',
              color: 'var(--ps-cream)',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--ps-cream-25)' }}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Execution list ── */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1.5">
          {executions.length === 0 && (
            <p className="text-[11px] text-center py-8" style={{ color: 'var(--ps-cream-25)' }}>
              Nenhuma execução encontrada
            </p>
          )}

          {executions.map((exec) => {
            const cfg = getStatusConfig(exec.status);
            const Icon = cfg.icon;
            const isExpanded = expandedExecId === exec.id;

            return (
              <div
                key={exec.id}
                className="rounded-lg overflow-hidden transition-all"
                style={{
                  border: isExpanded
                    ? `1px solid ${cfg.color.replace('text-', '').includes('emerald') ? '#22c55e' : cfg.color.includes('destructive') ? '#ef4444' : cfg.color.includes('blue') ? '#3b82f6' : 'var(--ps-border)'}40`
                    : '1px solid var(--ps-border)',
                }}
              >
                {/* ── Execution row ── */}
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
                  onClick={() => loadSteps(exec.id)}
                >
                  {isExpanded
                    ? <ChevronDown className="h-3 w-3 shrink-0" style={{ color: 'var(--ps-cream-40)' }} />
                    : <ChevronRight className="h-3 w-3 shrink-0" style={{ color: 'var(--ps-cream-40)' }} />
                  }
                  <Icon className={`h-4 w-4 shrink-0 ${cfg.color} ${exec.status === "running" ? "animate-spin" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-mono truncate" style={{ color: 'var(--ps-cream-80)' }}>
                      {exec.session_id.slice(0, 12)}…
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--ps-cream-25)' }}>
                      {formatTime(exec.started_at)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {exec.total_latency_ms != null && (
                      <div className="text-[10px]" style={{ color: 'var(--ps-cream-40)' }}>
                        {formatLatency(exec.total_latency_ms)}
                      </div>
                    )}
                    {exec.nodes_executed != null && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal" style={{ borderColor: 'var(--ps-border)', color: 'var(--ps-cream-40)' }}>
                        {exec.nodes_executed} nós
                      </Badge>
                    )}
                  </div>
                </button>

                {/* ── Expanded steps timeline ── */}
                {isExpanded && (
                  <div className="border-t px-3 py-2 space-y-1" style={{ borderColor: 'var(--ps-border)', background: 'var(--ps-bg-deep)' }}>
                    {/* Stats bar */}
                    {steps.length > 0 && (
                      <div className="flex items-center gap-2 pb-1.5 mb-1.5 border-b text-[10px]" style={{ borderColor: 'var(--ps-border)', color: 'var(--ps-cream-25)' }}>
                        <span>{steps.length} steps</span>
                        <span>•</span>
                        <span>
                          {steps.filter((s) => s.status === "completed").length} ok
                        </span>
                        {steps.some((s) => s.status === "failed") && (
                          <>
                            <span>•</span>
                            <span className="text-destructive">
                              {steps.filter((s) => s.status === "failed").length} falhas
                            </span>
                          </>
                        )}
                        {steps.some((s) => s.cost_cents) && (
                          <>
                            <span>•</span>
                            <span>
                              ${(steps.reduce((sum, s) => sum + (s.cost_cents || 0), 0) / 100).toFixed(4)}
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {filteredSteps.length === 0 && (
                      <p className="text-[10px] text-center py-2" style={{ color: 'var(--ps-cream-25)' }}>
                        {search ? "Nenhum step encontrado" : "Carregando steps…"}
                      </p>
                    )}

                    {filteredSteps.map((step, i) => {
                      const sCfg = getStatusConfig(step.status);
                      const SIcon = sCfg.icon;
                      const nodeName = nodes.find((n) => n.id === step.node_id)?.data?.label as string || step.node_type;
                      const nodeColor = getNodeColor(step.node_type);
                      const isStepExpanded = expandedStepId === step.id;

                      return (
                        <div key={step.id}>
                          <div
                            className="flex items-start gap-2 group cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-white/[0.03]"
                            style={{
                              background: isStepExpanded ? 'rgba(255,255,255,0.03)' : undefined,
                            }}
                            onClick={() => {
                              setExpandedStepId(isStepExpanded ? null : step.id);
                              onHighlightNode(step.node_id);
                            }}
                            onMouseEnter={() => onHighlightNode(step.node_id)}
                            onMouseLeave={() => {
                              if (!isStepExpanded) onHighlightNode(null);
                            }}
                          >
                            {/* Timeline indicator */}
                            <div className="flex flex-col items-center shrink-0 pt-0.5">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                  background: step.status === "completed"
                                    ? nodeColor
                                    : step.status === "failed"
                                      ? "#ef4444"
                                      : step.status === "running"
                                        ? "#3b82f6"
                                        : "var(--ps-border)",
                                }}
                              />
                              {i < filteredSteps.length - 1 && (
                                <div className="w-px h-full mt-1" style={{ background: 'var(--ps-border)' }} />
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-medium truncate" style={{ color: 'var(--ps-cream-80)' }}>
                                  {String(nodeName)}
                                </span>
                                {step.node_type && (
                                  <span
                                    className="text-[8px] px-1 py-0.5 rounded font-mono uppercase tracking-wider shrink-0"
                                    style={{
                                      background: `${nodeColor}20`,
                                      color: nodeColor,
                                      border: `1px solid ${nodeColor}30`,
                                    }}
                                  >
                                    {step.node_type}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[9px] mt-0.5" style={{ color: 'var(--ps-cream-25)' }}>
                                {step.latency_ms != null && <span>{formatLatency(step.latency_ms)}</span>}
                                {(step.tokens_in || step.tokens_out) && (
                                  <span>📊 {step.tokens_in || 0}→{step.tokens_out || 0} tok</span>
                                )}
                                {step.cost_cents != null && step.cost_cents > 0 && (
                                  <span>💰 ${(step.cost_cents / 100).toFixed(4)}</span>
                                )}
                                <SIcon
                                  className={`h-2.5 w-2.5 ml-auto ${sCfg.color} ${step.status === "running" ? "animate-spin" : ""}`}
                                />
                              </div>
                              {step.error_message && (
                                <p className="text-[10px] text-destructive mt-0.5 truncate">{step.error_message}</p>
                              )}
                            </div>

                            {/* Expand indicator */}
                            {!isStepExpanded && (
                              <ChevronRight className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--ps-cream-25)' }} />
                            )}
                            {isStepExpanded && (
                              <ChevronDown className="h-3 w-3 shrink-0" style={{ color: 'var(--ps-cream-25)' }} />
                            )}
                          </div>

                          {/* ── Expanded step details with I/O viewer ── */}
                          {isStepExpanded && (
                            <div className="ml-5 pl-3 pb-2 space-y-2" style={{ borderLeft: '1px solid var(--ps-border)' }}>
                              {step.error_message && (
                                <div className="p-2 rounded text-[10px]" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                                  {step.error_message}
                                </div>
                              )}
                              <div className="space-y-1.5">
                                <ExecutionDataViewer
                                  data={step.input_data}
                                  label="INPUT"
                                  maxHeight="160px"
                                  compact
                                />
                                <ExecutionDataViewer
                                  data={step.output_data}
                                  label="OUTPUT"
                                  maxHeight="240px"
                                  compact
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {exec.error_message && (
                      <div className="mt-2 p-2 rounded text-[10px]" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
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
