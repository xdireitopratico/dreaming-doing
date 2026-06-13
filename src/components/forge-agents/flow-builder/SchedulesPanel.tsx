/**
 * SchedulesPanel — Gerenciamento de agendamentos (cron) para execução automática de agentes
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import {
  X,
  Plus,
  Clock,
  Trash2,
  RefreshCw,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Play,
} from "lucide-react";

interface Schedule {
  id: string;
  name: string;
  cron_expression: string;
  timezone: string;
  is_active: boolean;
  input_payload: Record<string, unknown>;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
}

const CRON_PRESETS = [
  { label: "A cada minuto", cron: "* * * * *" },
  { label: "A cada 5 min", cron: "*/5 * * * *" },
  { label: "A cada 15 min", cron: "*/15 * * * *" },
  { label: "A cada hora", cron: "0 * * * *" },
  { label: "A cada 6 horas", cron: "0 */6 * * *" },
  { label: "Diário 9h", cron: "0 9 * * *" },
  { label: "Diário 18h", cron: "0 18 * * *" },
  { label: "Seg-Sex 9h", cron: "0 9 * * 1-5" },
  { label: "Semanal (Dom)", cron: "0 0 * * 0" },
  { label: "Mensal (dia 1)", cron: "0 0 1 * *" },
];

function describeCron(expr: string): string {
  const parts = expr.split(" ");
  if (parts.length !== 5) return expr;
  const [min, hour, dom, , dow] = parts;

  if (expr === "* * * * *") return "A cada minuto";
  if (min.startsWith("*/")) return `A cada ${min.slice(2)} minutos`;
  if (hour.startsWith("*/") && min === "0") return `A cada ${hour.slice(2)} horas`;
  if (dow === "1-5" && min !== "*" && hour !== "*") return `Seg-Sex às ${hour}:${min.padStart(2, "0")}`;
  if (dow === "0" && min !== "*" && hour !== "*") return `Domingos às ${hour}:${min.padStart(2, "0")}`;
  if (dom === "1" && min !== "*" && hour !== "*") return `Dia 1 do mês às ${hour}:${min.padStart(2, "0")}`;
  if (min !== "*" && hour !== "*" && dom === "*") return `Diário às ${hour}:${min.padStart(2, "0")}`;
  return expr;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

interface SchedulesPanelProps {
  flowId: string;
  onClose: () => void;
}

export function SchedulesPanel({ flowId, onClose }: SchedulesPanelProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("Schedule");
  const [newCron, setNewCron] = useState("0 * * * *");
  const [newTimezone, setNewTimezone] = useState("America/Sao_Paulo");
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  ;

  const fetchSchedules = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("agent_schedules")
      .select("*")
      .eq("flow_id", flowId)
      .order("created_at", { ascending: false });

    if (!error && data) setSchedules(data as unknown as Schedule[]);
    setLoading(false);
  };

  useEffect(() => { fetchSchedules(); }, [flowId]);

  const handleCreate = async () => {
    setCreating(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) { setCreating(false); return; }

    const { error } = await supabase.from("agent_schedules").insert({
      flow_id: flowId,
      user_id: userData.user.id,
      name: newName,
      cron_expression: newCron,
      timezone: newTimezone,
    } as any);

    if (error) {
      toast({ title: "Erro ao criar schedule", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Schedule criado!" });
      setShowCreate(false);
      setNewName("Schedule");
      setNewCron("0 * * * *");
      fetchSchedules();
    }
    setCreating(false);
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase
      .from("agent_schedules")
      .update({ is_active: active, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    setSchedules((s) => s.map((x) => (x.id === id ? { ...x, is_active: active } : x)));
  };

  const handleDelete = async (id: string) => {
    await supabase.from("agent_schedules").delete().eq("id", id);
    setSchedules((s) => s.filter((x) => x.id !== id));
    toast({ title: "Schedule removido" });
  };

  const statusIcon = (status: string | null) => {
    if (status === "success") return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
    if (status === "error" || status === "failed") return <XCircle className="h-3 w-3 text-red-500" />;
    if (status === "running") return <Play className="h-3 w-3 text-blue-500" />;
    return <Clock className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <div className="w-[380px] border-l bg-background flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Schedules</h3>
          <Badge variant="secondary" className="text-xs">{schedules.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchSchedules}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Create button */}
        {!showCreate && (
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            Novo Schedule
          </Button>
        )}

        {/* Create form */}
        {showCreate && (
          <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
            <div className="text-xs font-semibold text-muted-foreground uppercase">Novo Schedule</div>

            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome do schedule"
              className="h-8 text-sm"
            />

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Cron Expression</label>
              <Input
                value={newCron}
                onChange={(e) => setNewCron(e.target.value)}
                placeholder="0 * * * *"
                className="h-8 text-sm font-mono"
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                {describeCron(newCron)}
              </div>
            </div>

            {/* Presets */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Presets</label>
              <div className="flex flex-wrap gap-1">
                {CRON_PRESETS.map((p) => (
                  <Badge
                    key={p.cron}
                    variant={newCron === p.cron ? "default" : "outline"}
                    className="text-[10px] cursor-pointer"
                    onClick={() => setNewCron(p.cron)}
                  >
                    {p.label}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Timezone</label>
              <Input
                value={newTimezone}
                onChange={(e) => setNewTimezone(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={creating || !newCron.trim()}>
                Criar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Schedules list */}
        {loading ? (
          <div className="text-center text-xs text-muted-foreground py-8">Carregando...</div>
        ) : schedules.length === 0 && !showCreate ? (
          <div className="text-center py-8 space-y-2">
            <Calendar className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Nenhum schedule configurado</p>
            <p className="text-[10px] text-muted-foreground">
              Crie um schedule para executar este agente automaticamente
            </p>
          </div>
        ) : (
          schedules.map((s) => (
            <div key={s.id} className="border rounded-lg overflow-hidden">
              {/* Schedule header */}
              <div
                className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {statusIcon(s.last_status)}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {s.cron_expression} — {describeCron(s.cron_expression)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={s.is_active}
                    onCheckedChange={(v) => handleToggle(s.id, v)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>

              {/* Expanded details */}
              {expandedId === s.id && (
                <div className="border-t p-3 space-y-2 bg-muted/20">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted-foreground">Execuções:</span>{" "}
                      <span className="font-medium">{s.run_count}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>{" "}
                      <Badge variant="outline" className="text-[10px] ml-1">
                        {s.last_status || "pending"}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Última exec:</span>{" "}
                      <span className="font-medium">{formatDate(s.last_run_at)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Próxima exec:</span>{" "}
                      <span className="font-medium">{formatDate(s.next_run_at)}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Timezone:</span>{" "}
                      <span className="font-medium">{s.timezone}</span>
                    </div>
                  </div>

                  {s.last_error && (
                    <div className="flex items-start gap-1.5 p-2 rounded bg-destructive/10 text-[10px]">
                      <AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                      <span className="text-destructive">{s.last_error}</span>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                      onClick={() => handleDelete(s.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Remover
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
