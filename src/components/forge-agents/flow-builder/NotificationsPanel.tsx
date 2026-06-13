/**
 * NotificationsPanel — Notificações e configuração de alertas por agente
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
  Bell,
  BellOff,
  Trash2,
  RefreshCw,
  CheckCheck,
  Plus,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Info,
  Clock,
  Zap,
  DollarSign,
} from "lucide-react";

interface Notification {
  id: string;
  flow_id: string;
  type: string;
  title: string;
  message: string | null;
  metadata: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

interface AlertRule {
  id: string;
  flow_id: string;
  name: string;
  rule_type: string;
  condition: Record<string, any>;
  is_active: boolean;
  created_at: string;
}

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  error: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  info: <Info className="h-3.5 w-3.5 text-blue-500" />,
};

const ALERT_RULE_TYPES = [
  { value: "error", label: "Erro de execução", icon: <XCircle className="h-3.5 w-3.5" />, desc: "Notifica quando uma execução falha" },
  { value: "timeout", label: "Timeout", icon: <Clock className="h-3.5 w-3.5" />, desc: "Notifica quando execução excede o limite" },
  { value: "budget", label: "Budget excedido", icon: <DollarSign className="h-3.5 w-3.5" />, desc: "Notifica quando custo ultrapassa o limite" },
  { value: "error_rate", label: "Taxa de erro alta", icon: <AlertTriangle className="h-3.5 w-3.5" />, desc: "Notifica quando taxa de erro sobe acima do threshold" },
  { value: "execution_complete", label: "Execução completa", icon: <CheckCircle2 className="h-3.5 w-3.5" />, desc: "Notifica ao completar cada execução" },
  { value: "schedule_missed", label: "Schedule perdido", icon: <Clock className="h-3.5 w-3.5" />, desc: "Notifica quando um agendamento falha" },
];

function formatDate(d: string): string {
  const now = new Date();
  const date = new Date(d);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
}

interface NotificationsPanelProps {
  flowId: string;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}

export function NotificationsPanel({ flowId, onClose, onUnreadChange }: NotificationsPanelProps) {
  const [tab, setTab] = useState<"inbox" | "rules">("inbox");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [newRuleType, setNewRuleType] = useState("error");
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleThreshold, setNewRuleThreshold] = useState("");
  ;

  const fetchNotifications = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("agent_notifications")
      .select("*")
      .eq("flow_id", flowId)
      .order("created_at", { ascending: false })
      .limit(50);
    const notifs = (data as unknown as Notification[]) || [];
    setNotifications(notifs);
    onUnreadChange?.(notifs.filter((n) => !n.is_read).length);
    setLoading(false);
  };

  const fetchRules = async () => {
    const { data } = await supabase
      .from("agent_alert_rules")
      .select("*")
      .eq("flow_id", flowId)
      .order("created_at", { ascending: false });
    setAlertRules((data as unknown as AlertRule[]) || []);
  };

  useEffect(() => {
    fetchNotifications();
    fetchRules();
  }, [flowId]);

  // Polling every 5 min (no Realtime)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchNotifications();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [flowId]);

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    await supabase
      .from("agent_notifications")
      .update({ is_read: true } as any)
      .in("id", unreadIds);
    setNotifications((n) => n.map((x) => ({ ...x, is_read: true })));
    onUnreadChange?.(0);
  };

  const deleteNotification = async (id: string) => {
    await supabase.from("agent_notifications").delete().eq("id", id);
    setNotifications((n) => n.filter((x) => x.id !== id));
  };

  const clearAll = async () => {
    await supabase.from("agent_notifications").delete().eq("flow_id", flowId);
    setNotifications([]);
    onUnreadChange?.(0);
    toast({ title: "Notificações limpas" });
  };

  const handleCreateRule = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    const ruleInfo = ALERT_RULE_TYPES.find((r) => r.value === newRuleType);
    const { error } = await supabase.from("agent_alert_rules").insert({
      flow_id: flowId,
      user_id: userData.user.id,
      name: newRuleName || ruleInfo?.label || "Alerta",
      rule_type: newRuleType,
      condition: { threshold: newRuleThreshold ? parseFloat(newRuleThreshold) : null },
    } as any);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Regra criada!" });
      setShowCreateRule(false);
      setNewRuleName("");
      setNewRuleThreshold("");
      fetchRules();
    }
  };

  const toggleRule = async (id: string, active: boolean) => {
    await supabase.from("agent_alert_rules").update({ is_active: active } as any).eq("id", id);
    setAlertRules((r) => r.map((x) => (x.id === id ? { ...x, is_active: active } : x)));
  };

  const deleteRule = async (id: string) => {
    await supabase.from("agent_alert_rules").delete().eq("id", id);
    setAlertRules((r) => r.filter((x) => x.id !== id));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="w-[380px] border-l bg-background flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Notificações</h3>
          {unreadCount > 0 && (
            <Badge className="text-[10px] h-5 min-w-5 flex items-center justify-center">{unreadCount}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchNotifications} title="Atualizar">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(["inbox", "rules"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "inbox" ? `Inbox${unreadCount > 0 ? ` (${unreadCount})` : ""}` : "Regras de Alerta"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* Inbox Tab */}
        {tab === "inbox" && (
          <>
            {unreadCount > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs" onClick={markAllRead}>
                  <CheckCheck className="h-3 w-3" />
                  Marcar todas como lidas
                </Button>
                <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={clearAll}>
                  Limpar
                </Button>
              </div>
            )}

            {loading ? (
              <div className="text-center text-xs text-muted-foreground py-8">Carregando...</div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <BellOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`border rounded-lg p-3 space-y-1 transition-colors ${
                    n.is_read ? "opacity-60" : "bg-primary/5 border-primary/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {NOTIFICATION_ICONS[n.type] || NOTIFICATION_ICONS.info}
                      <div className="min-w-0">
                        <div className="text-xs font-medium">{n.title}</div>
                        {n.message && (
                          <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{n.message}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{formatDate(n.created_at)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => deleteNotification(n.id)}
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* Rules Tab */}
        {tab === "rules" && (
          <>
            {!showCreateRule && (
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setShowCreateRule(true)}>
                <Plus className="h-3.5 w-3.5" />
                Nova Regra de Alerta
              </Button>
            )}

            {showCreateRule && (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <div className="text-xs font-semibold text-muted-foreground uppercase">Nova Regra</div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Tipo</label>
                  <div className="space-y-1">
                    {ALERT_RULE_TYPES.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => { setNewRuleType(r.value); setNewRuleName(r.label); }}
                        className={`w-full flex items-center gap-2 p-2 rounded text-left text-xs transition-colors ${
                          newRuleType === r.value ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"
                        }`}
                      >
                        {r.icon}
                        <div>
                          <div className="font-medium">{r.label}</div>
                          <div className="text-[10px] text-muted-foreground">{r.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nome personalizado</label>
                  <Input
                    value={newRuleName}
                    onChange={(e) => setNewRuleName(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>

                {(newRuleType === "budget" || newRuleType === "error_rate") && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {newRuleType === "budget" ? "Limite de custo ($)" : "Threshold de erro (%)"}
                    </label>
                    <Input
                      type="number"
                      value={newRuleThreshold}
                      onChange={(e) => setNewRuleThreshold(e.target.value)}
                      placeholder={newRuleType === "budget" ? "10.00" : "20"}
                      className="h-8 text-sm w-28"
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreateRule}>Criar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCreateRule(false)}>Cancelar</Button>
                </div>
              </div>
            )}

            {alertRules.length === 0 && !showCreateRule ? (
              <div className="text-center py-8 space-y-2">
                <Zap className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Nenhuma regra de alerta</p>
                <p className="text-[10px] text-muted-foreground">Configure alertas para monitorar seu agente</p>
              </div>
            ) : (
              alertRules.map((r) => {
                const ruleInfo = ALERT_RULE_TYPES.find((t) => t.value === r.rule_type);
                return (
                  <div key={r.id} className="border rounded-lg p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {ruleInfo?.icon || <Bell className="h-3.5 w-3.5" />}
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground">{ruleInfo?.desc}</div>
                        {r.condition?.threshold && (
                          <Badge variant="outline" className="text-[9px] mt-0.5">
                            Threshold: {r.condition.threshold}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={(v) => toggleRule(r.id, v)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => deleteRule(r.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
