/**
 * HealingHistoryPanel — Shows healing log entries for a flow
 * P15: Symptoms, diagnoses, treatments, outcomes
 */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, AlertTriangle, CheckCircle2, XCircle, Clock, Loader2, Shield } from "lucide-react";

interface HealingEntry {
  id: string;
  symptom: string;
  diagnosis: string | null;
  root_cause: string | null;
  severity: string | null;
  treatment_applied: string | null;
  outcome: string | null;
  model_used: string | null;
  diagnosis_latency_ms: number | null;
  created_at: string | null;
  resolved_at: string | null;
  shadow_result: Record<string, unknown> | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-destructive/20 text-destructive border-destructive/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const OUTCOME_ICONS: Record<string, React.ReactNode> = {
  treated: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
  shadow_treated: <Shield className="h-3.5 w-3.5 text-yellow-400" />,
  treatment_failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  diagnosed: <Clock className="h-3.5 w-3.5 text-blue-400" />,
  diagnosis_failed: <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />,
  max_corrections_reached: <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />,
};

const SYMPTOM_LABELS: Record<string, string> = {
  error_spike: "Pico de Erros",
  quality_drop: "Queda de Qualidade",
  latency_spike: "Pico de Latência",
};

const TREATMENT_LABELS: Record<string, string> = {
  prompt_rewrite: "Reescrita de Prompt",
  model_switch: "Troca de Modelo",
  timeout_adjust: "Ajuste de Timeout",
  cache_clear: "Limpeza de Cache",
  rollback: "Rollback",
};

interface Props {
  flowId: string;
}

export function HealingHistoryPanel({ flowId }: Props) {
  const [entries, setEntries] = useState<HealingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("prometheus_healing_log")
        .select("*")
        .eq("flow_id", flowId)
        .order("created_at", { ascending: false })
        .limit(50);

      setEntries((data as unknown as HealingEntry[]) || []);
      setLoading(false);
    })();
  }, [flowId]);

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Histórico de Auto-Heal</CardTitle>
          <Badge variant="secondary" className="text-xs">{entries.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum evento de healing registrado.</p>
        ) : (
          <ScrollArea className="h-[400px] pr-2">
            <div className="space-y-3">
              {entries.map(entry => (
                <div key={entry.id} className="border border-border rounded-lg p-3 space-y-2">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[entry.severity || "low"]}`}>
                        {entry.severity || "—"}
                      </Badge>
                      <span className="text-sm font-medium">{SYMPTOM_LABELS[entry.symptom] || entry.symptom}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {OUTCOME_ICONS[entry.outcome || "diagnosed"]}
                      <span className="text-xs text-muted-foreground">{entry.outcome || "—"}</span>
                    </div>
                  </div>

                  {/* Diagnosis */}
                  {entry.diagnosis && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{entry.diagnosis}</p>
                  )}

                  {/* Treatment + Meta */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {entry.treatment_applied && (
                        <Badge variant="secondary" className="text-[10px]">
                          {TREATMENT_LABELS[entry.treatment_applied] || entry.treatment_applied}
                        </Badge>
                      )}
                      {entry.model_used && <span>Modelo: {entry.model_used.split("/").pop()}</span>}
                      {entry.diagnosis_latency_ms && <span>{entry.diagnosis_latency_ms}ms</span>}
                    </div>
                    <span>{entry.created_at ? new Date(entry.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
