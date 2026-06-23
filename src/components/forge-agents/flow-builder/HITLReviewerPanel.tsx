// @ts-nocheck
/**
 * HITLReviewerPanel — Fila de aprovação Human-in-the-Loop
 * Exibe execuções pausadas aguardando decisão humana.
 * 
 * @version 1.0.0 — Round 38
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2, XCircle, Edit3, Clock, AlertTriangle, Bot,
  RefreshCw, Filter, ChevronDown, ChevronUp, MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface HITLPendingItem {
  id: string;
  flow_id: string | null;
  flow_name: string;
  session_id: string;
  current_state: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  pause_fallback_action: string | null;
  pause_timeout_at: string | null;
  context: {
    message?: string;
    proposed_response?: string;
    channel?: string;
  };
  time_remaining_minutes: number;
}

export function HITLReviewerPanel() {
  const [pending, setPending] = useState<HITLPendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modifiedResponses, setModifiedResponses] = useState<Record<string, string>>({});
  const [deciding, setDeciding] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [history, setHistory] = useState<Array<{ id: string; flow_name: string; action: string; decided_at: string; decided_by: string }>>([]);
  ;

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const { data: executions, error } = await supabase
        .from("agent_executions")
        .select("id, flow_id, session_id, current_state, paused_at, pause_reason, pause_fallback_action, pause_timeout_at, fsm_snapshot, created_at")
        .eq("is_paused", true)
        .order("paused_at", { ascending: true });

      if (error) throw error;

      const flowIds = [...new Set((executions || []).map(e => e.flow_id).filter(Boolean))] as string[];
      const { data: flows } = flowIds.length > 0
        ? await supabase.from("agent_flows").select("id, name").in("id", flowIds)
        : { data: [] };

      const flowMap = new Map((flows || []).map(f => [f.id, f.name]));

      const items: HITLPendingItem[] = (executions || []).map(exec => {
        const snapshot = (exec.fsm_snapshot as Record<string, any>) || {};
        const timeoutAt = exec.pause_timeout_at ? new Date(exec.pause_timeout_at).getTime() : null;
        const remaining = timeoutAt ? Math.max(0, Math.round((timeoutAt - Date.now()) / 60000)) : 60;

        return {
          id: exec.id,
          flow_id: exec.flow_id,
          flow_name: exec.flow_id ? (flowMap.get(exec.flow_id) || "Flow desconhecido") : "—",
          session_id: exec.session_id,
          current_state: exec.current_state,
          paused_at: exec.paused_at,
          pause_reason: exec.pause_reason || "Aguardando aprovação humana",
          pause_fallback_action: exec.pause_fallback_action || "abort",
          pause_timeout_at: exec.pause_timeout_at,
          context: {
            message: snapshot.message || snapshot.input_message,
            proposed_response: snapshot.proposed_response || snapshot.last_output?.response,
            channel: snapshot.channel || "web",
          },
          time_remaining_minutes: remaining,
        };
      });

      setPending(items);
    } catch (err) {
      console.error("[HITL] Error fetching pending:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    const { data } = await supabase
      .from("agent_executions")
      .select("id, flow_id, fsm_snapshot, completed_at")
      .in("status", ["completed", "failed"])
      .not("fsm_snapshot", "is", null)
      .order("completed_at", { ascending: false })
      .limit(50);

    if (!data) return;

    // Filter those with hitl_decision in snapshot
    const withDecision = data.filter(d => {
      const snap = d.fsm_snapshot as Record<string, any>;
      return snap?.hitl_decision;
    });

    const flowIds = [...new Set(withDecision.map(d => d.flow_id).filter(Boolean))] as string[];
    const { data: flows } = flowIds.length > 0
      ? await supabase.from("agent_flows").select("id, name").in("id", flowIds)
      : { data: [] };
    const flowMap = new Map((flows || []).map(f => [f.id, f.name]));

    setHistory(withDecision.map(d => {
      const snap = (d.fsm_snapshot as Record<string, any>) || {};
      const decision = snap.hitl_decision || {};
      return {
        id: d.id,
        flow_name: d.flow_id ? (flowMap.get(d.flow_id) || "—") : "—",
        action: decision.action || "approved",
        decided_at: decision.decided_at || d.completed_at || "",
        decided_by: decision.decided_by || "unknown",
      };
    }));
  }, []);

  useEffect(() => {
    fetchPending();
    fetchHistory();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, [fetchPending, fetchHistory]);

  const handleDecision = async (executionId: string, action: "approved" | "rejected" | "modified") => {
    setDeciding(executionId);
    try {
      const response = modifiedResponses[executionId];
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/aetherforge-gateway`;
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: "hitl_decide",
          execution_id: executionId,
          decision: {
            action,
            modified_response: action === "modified" ? response : undefined,
            decided_by: session?.session?.user?.email || "reviewer",
          },
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to submit decision");

      toast({
        title: action === "approved" ? "✅ Aprovado" : action === "rejected" ? "❌ Rejeitado" : "✏️ Modificado",
        description: `Execução ${executionId.slice(0, 8)} processada com sucesso.`,
      });

      await fetchPending();
      await fetchHistory();
      setExpandedId(null);
      setModifiedResponses(prev => { const n = { ...prev }; delete n[executionId]; return n; });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setDeciding(null);
    }
  };

  const filteredPending = filter === "all" ? pending : pending.filter(p => p.context.channel === filter);

  const urgencyColor = (mins: number) => {
    if (mins <= 5) return "text-destructive";
    if (mins <= 15) return "text-orange-500";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold">Aprovações HITL</h2>
          {pending.length > 0 && (
            <Badge variant="destructive" className="text-xs">{pending.length} pendente{pending.length !== 1 ? "s" : ""}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="web">Web</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="api">API</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={fetchPending} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
        <button
          className={cn("flex-1 text-xs py-1.5 rounded-md transition-colors", tab === "pending" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}
          onClick={() => setTab("pending")}
        >
          Pendentes ({pending.length})
        </button>
        <button
          className={cn("flex-1 text-xs py-1.5 rounded-md transition-colors", tab === "history" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}
          onClick={() => setTab("history")}
        >
          Histórico
        </button>
      </div>

      {tab === "pending" && (
        <div className="space-y-2">
          {loading && pending.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
          )}
          {!loading && filteredPending.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Nenhuma aprovação pendente
            </div>
          )}
          {filteredPending.map(item => (
            <Card key={item.id} className={cn("border", item.time_remaining_minutes <= 5 && "border-destructive/50")}>
              <CardHeader className="p-3 pb-2 cursor-pointer" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{item.flow_name}</span>
                    <Badge variant="outline" className="text-[10px]">{item.context.channel}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className={cn("h-3 w-3", urgencyColor(item.time_remaining_minutes))} />
                    <span className={cn("text-xs", urgencyColor(item.time_remaining_minutes))}>
                      {item.time_remaining_minutes}min
                    </span>
                    {expandedId === item.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{item.pause_reason}</p>
              </CardHeader>

              {expandedId === item.id && (
                <CardContent className="p-3 pt-0 space-y-3">
                  {item.context.message && (
                    <div className="bg-muted/50 rounded-md p-2">
                      <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> Mensagem do usuário
                      </div>
                      <p className="text-xs">{item.context.message}</p>
                    </div>
                  )}
                  {item.context.proposed_response && (
                    <div className="bg-primary/5 rounded-md p-2">
                      <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                        <Bot className="h-3 w-3" /> Resposta proposta
                      </div>
                      <p className="text-xs">{item.context.proposed_response}</p>
                    </div>
                  )}

                  <Textarea
                    placeholder="Modificar resposta (opcional)..."
                    className="text-xs min-h-[60px]"
                    value={modifiedResponses[item.id] || ""}
                    onChange={e => setModifiedResponses(prev => ({ ...prev, [item.id]: e.target.value }))}
                  />

                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 text-xs" onClick={() => handleDecision(item.id, "approved")} disabled={deciding === item.id}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Aprovar
                    </Button>
                    {modifiedResponses[item.id] && (
                      <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={() => handleDecision(item.id, "modified")} disabled={deciding === item.id}>
                        <Edit3 className="h-3 w-3 mr-1" /> Enviar Modificado
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" className="text-xs" onClick={() => handleDecision(item.id, "rejected")} disabled={deciding === item.id}>
                      <XCircle className="h-3 w-3 mr-1" /> Rejeitar
                    </Button>
                  </div>

                  <div className="text-[10px] text-muted-foreground flex items-center gap-3">
                    <span>ID: {item.id.slice(0, 8)}</span>
                    <span>Pausado: {item.paused_at ? new Date(item.paused_at).toLocaleString("pt-BR") : "—"}</span>
                    <span>Fallback: {item.pause_fallback_action}</span>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-1">
          {history.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma decisão registrada</div>
          )}
          {history.map(item => (
            <div key={item.id} className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-md">
              <div className="flex items-center gap-2">
                {item.action === "approved" && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                {item.action === "rejected" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                {item.action === "modified" && <Edit3 className="h-3.5 w-3.5 text-accent-foreground" />}
                <span className="text-xs font-medium">{item.flow_name}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{item.decided_by}</span>
                <span>{new Date(item.decided_at).toLocaleString("pt-BR")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
