/**
 * DLQManagementPanel — Dead Letter Queue management with retry/resolve/discard
 * Round 43: Saga/Compensation + DLQ Funcional
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import {
  X, RefreshCw, RotateCcw, CheckCircle2, Trash2,
  AlertTriangle, ChevronDown, ChevronRight, Clock,
  Inbox, BarChart3, Loader2,
} from "lucide-react";

interface DLQManagementPanelProps {
  flowId: string;
  onClose: () => void;
}

interface DLQEntry {
  id: string;
  execution_id: string | null;
  step_id: string | null;
  node_type: string | null;
  error_code: string;
  error_message: string | null;
  error_stack: string | null;
  input_data: Record<string, unknown> | null;
  node_config: Record<string, unknown> | null;
  fsm_snapshot: Record<string, unknown> | null;
  retry_count: number | null;
  resolution_status: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string | null;
}

type TabType = "pending" | "resolved" | "metrics";

export function DLQManagementPanel({ flowId, onClose }: DLQManagementPanelProps) {
  const [entries, setEntries] = useState<DLQEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({});
  ;

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("execution_dead_letter_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (tab === "pending") {
        query = query.or("resolution_status.is.null,resolution_status.eq.pending");
      } else if (tab === "resolved") {
        query = query.in("resolution_status", ["resolved", "discarded", "retried"]);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEntries((data as unknown as DLQEntry[]) || []);
    } catch (err) {
      console.error("[DLQ] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleRetry = async (entry: DLQEntry) => {
    setActionLoading(entry.id);
    try {
      // Re-execute via gateway
      if (entry.execution_id && entry.input_data) {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/aetherforge-gateway`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "dlq_retry",
              dlq_id: entry.id,
              execution_id: entry.execution_id,
              input_data: entry.input_data,
              node_config: entry.node_config,
            }),
          }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Retry failed");
      }

      // Mark as retried
      await supabase
        .from("execution_dead_letter_queue")
        .update({
          resolution_status: "retried",
          resolved_at: new Date().toISOString(),
          retry_count: (entry.retry_count || 0) + 1,
        })
        .eq("id", entry.id);

      toast({ title: "Retry enviado", description: `DLQ #${entry.id.slice(0, 8)} re-executado` });
      fetchEntries();
    } catch (err) {
      toast({ title: "Erro no retry", description: (err as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (entry: DLQEntry) => {
    setActionLoading(entry.id);
    try {
      await supabase
        .from("execution_dead_letter_queue")
        .update({
          resolution_status: "resolved",
          resolution_notes: resolveNotes[entry.id] || "Resolvido manualmente",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", entry.id);

      toast({ title: "Resolvido", description: `DLQ #${entry.id.slice(0, 8)} marcado como resolvido` });
      fetchEntries();
    } catch (err) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDiscard = async (entry: DLQEntry) => {
    setActionLoading(entry.id);
    try {
      await supabase
        .from("execution_dead_letter_queue")
        .update({
          resolution_status: "discarded",
          resolution_notes: resolveNotes[entry.id] || "Descartado",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", entry.id);

      toast({ title: "Descartado", description: `DLQ #${entry.id.slice(0, 8)} descartado` });
      fetchEntries();
    } catch (err) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = entries.filter(e => !e.resolution_status || e.resolution_status === "pending").length;
  const resolvedCount = entries.filter(e => e.resolution_status === "resolved").length;
  const retriedCount = entries.filter(e => e.resolution_status === "retried").length;
  const discardedCount = entries.filter(e => e.resolution_status === "discarded").length;

  const statusColor = (status: string | null) => {
    switch (status) {
      case "resolved": return "text-emerald-500";
      case "retried": return "text-blue-500";
      case "discarded": return "text-muted-foreground";
      default: return "text-red-500";
    }
  };

  return (
    <div className="w-[420px] border-l bg-background flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="h-12 border-b flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-red-500" />
          <span className="font-semibold text-sm">Dead Letter Queue</span>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {pendingCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchEntries}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b px-2 gap-1 shrink-0">
        {([
          { key: "pending" as TabType, label: "Pendentes", icon: AlertTriangle },
          { key: "resolved" as TabType, label: "Resolvidos", icon: CheckCircle2 },
          { key: "metrics" as TabType, label: "Métricas", icon: BarChart3 },
        ]).map(t => (
          <button
            key={t.key}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
              tab === t.key
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab(t.key)}
          >
            <t.icon className="h-3 w-3" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tab === "metrics" ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Pendentes" value={pendingCount} color="text-red-500" />
              <MetricCard label="Resolvidos" value={resolvedCount} color="text-emerald-500" />
              <MetricCard label="Re-executados" value={retriedCount} color="text-blue-500" />
              <MetricCard label="Descartados" value={discardedCount} color="text-muted-foreground" />
            </div>
            <div className="text-xs text-muted-foreground pt-2">
              Taxa de resolução: {entries.length > 0
                ? `${Math.round(((resolvedCount + retriedCount) / Math.max(entries.length, 1)) * 100)}%`
                : "N/A"}
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm text-muted-foreground">
              {tab === "pending" ? "Nenhum erro pendente" : "Nenhum registro resolvido"}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {entries.map(entry => {
              const isExpanded = expandedId === entry.id;
              const isActing = actionLoading === entry.id;
              return (
                <div key={entry.id} className="border rounded-lg bg-card">
                  {/* Entry header */}
                  <button
                    className="w-full flex items-start gap-2 p-3 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{entry.node_type || "unknown"}</Badge>
                        <span className={`text-[10px] font-mono ${statusColor(entry.resolution_status)}`}>
                          {entry.error_code}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {entry.error_message || "Sem mensagem"}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {entry.created_at ? new Date(entry.created_at).toLocaleString("pt-BR") : "—"}
                        </span>
                        {(entry.retry_count || 0) > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            · {entry.retry_count} retries
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3 border-t pt-3">
                      {/* Error stack */}
                      {entry.error_stack && (
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground mb-1">Stack Trace</p>
                          <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-24 whitespace-pre-wrap">
                            {entry.error_stack}
                          </pre>
                        </div>
                      )}

                      {/* Input data */}
                      {entry.input_data && (
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground mb-1">Input Data</p>
                          <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-20 whitespace-pre-wrap">
                            {JSON.stringify(entry.input_data, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Execution ID */}
                      {entry.execution_id && (
                        <p className="text-[10px] text-muted-foreground">
                          Exec: <span className="font-mono">{entry.execution_id.slice(0, 12)}...</span>
                        </p>
                      )}

                      {/* Actions (pending only) */}
                      {tab === "pending" && (
                        <>
                          <Textarea
                            placeholder="Notas de resolução..."
                            className="text-xs h-16 resize-none"
                            value={resolveNotes[entry.id] || ""}
                            onChange={e => setResolveNotes(prev => ({ ...prev, [entry.id]: e.target.value }))}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1"
                              disabled={isActing}
                              onClick={() => handleRetry(entry)}
                            >
                              {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                              Retry
                            </Button>
                            <Button
                              size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1 text-emerald-600"
                              disabled={isActing}
                              onClick={() => handleResolve(entry)}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Resolver
                            </Button>
                            <Button
                              size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
                              disabled={isActing}
                              onClick={() => handleDiscard(entry)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </>
                      )}

                      {/* Resolution info (resolved) */}
                      {tab === "resolved" && entry.resolution_notes && (
                        <div className="text-[10px] text-muted-foreground">
                          <span className="font-medium">Resolução:</span> {entry.resolution_notes}
                          {entry.resolved_at && (
                            <> · {new Date(entry.resolved_at).toLocaleString("pt-BR")}</>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border rounded-lg p-3 bg-card">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
