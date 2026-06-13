/**
 * WebhookInboxPanel — Gestão de webhooks recebidos + triggers por evento
 * Synced with real webhook_inbox schema (body, dedup_key, signature_verified, external_id)
 */
import { useState, useEffect, useCallback } from "react";
import {
  X, Webhook, RefreshCw, Play, Search, ChevronDown, ChevronRight,
  CheckCircle2, AlertCircle, Clock, Trash2, Copy, ShieldCheck, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";

/** Matches webhook_inbox table schema exactly */
interface WebhookEntry {
  id: string;
  source: string;
  body: Record<string, unknown>;
  headers: Record<string, string> | null;
  status: string | null;
  processed_at: string | null;
  created_at: string | null;
  dedup_key: string | null;
  retry_count: number | null;
  max_retries: number | null;
  next_retry_at: string | null;
  error_message: string | null;
  external_id: string | null;
  signature: string | null;
  signature_verified: boolean | null;
}

interface TriggerConfig {
  id: string;
  event_type: string;
  source_filter: string;
  payload_path: string;
  payload_value: string;
  enabled: boolean;
}

interface WebhookInboxPanelProps {
  flowId: string;
  onClose: () => void;
}

export function WebhookInboxPanel({ flowId, onClose }: WebhookInboxPanelProps) {
  const [activeTab, setActiveTab] = useState("inbox");
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [triggers, setTriggers] = useState<TriggerConfig[]>([]);
  const [newTrigger, setNewTrigger] = useState({ event_type: "", source_filter: "", payload_path: "", payload_value: "" });
  ;

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("webhook_inbox")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) console.error("[WebhookInbox] Error:", error);
    else setWebhooks((data as unknown as WebhookEntry[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  useEffect(() => {
    const saved = localStorage.getItem(`webhook_triggers_${flowId}`);
    if (saved) try { setTriggers(JSON.parse(saved)); } catch {}
  }, [flowId]);

  const saveTriggers = (t: TriggerConfig[]) => {
    setTriggers(t);
    localStorage.setItem(`webhook_triggers_${flowId}`, JSON.stringify(t));
  };

  const filtered = webhooks.filter((w) => {
    const matchSearch = w.source.toLowerCase().includes(search.toLowerCase()) ||
      (w.dedup_key || "").includes(search);
    const matchStatus = statusFilter === "all" || w.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleReplay = async (webhook: WebhookEntry) => {
    setReplayingId(webhook.id);
    try {
      // BUG 120 FIX: Include Authorization header
      const { data: { session } } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/aetherforge-webhook-worker`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Flow-Id": flowId,
            "X-Dedup-Key": `replay_${webhook.id}_${Date.now()}`,
            ...(session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify(webhook.body),
        }
      );
      toast({ title: res.ok ? "Webhook reenviado!" : "Erro ao reenviar", variant: res.ok ? "default" : "destructive" });
      if (res.ok) fetchWebhooks();
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    }
    setReplayingId(null);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("webhook_inbox").delete().eq("id", id);
    if (error) toast({ title: "Erro ao deletar", variant: "destructive" });
    else { setWebhooks(prev => prev.filter(w => w.id !== id)); toast({ title: "Webhook removido" }); }
  };

  const copyPayload = (body: Record<string, unknown>) => {
    navigator.clipboard.writeText(JSON.stringify(body, null, 2));
    toast({ title: "Payload copiado!" });
  };

  const addTrigger = () => {
    if (!newTrigger.event_type) return;
    saveTriggers([...triggers, { id: `trigger_${Date.now()}`, ...newTrigger, enabled: true }]);
    setNewTrigger({ event_type: "", source_filter: "", payload_path: "", payload_value: "" });
    toast({ title: "Trigger adicionado!" });
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const statusIcon = (status: string | null) => {
    switch (status) {
      case "processed": return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
      case "failed": return <AlertCircle className="h-3 w-3 text-destructive" />;
      case "processing": return <RefreshCw className="h-3 w-3 text-blue-500 animate-spin" />;
      default: return <Clock className="h-3 w-3 text-amber-500" />;
    }
  };

  const webhookWorkerUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID || "***"}.supabase.co/functions/v1/aetherforge-webhook-worker`;

  return (
    <div className="w-96 border-l bg-background flex flex-col shrink-0 max-h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Webhook className="h-4 w-4 text-primary" />
          Webhooks
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchWebhooks} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-2 grid grid-cols-2">
          <TabsTrigger value="inbox" className="text-xs">Inbox</TabsTrigger>
          <TabsTrigger value="triggers" className="text-xs">Triggers</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="flex-1 flex flex-col min-h-0 m-0">
          <div className="px-3 pt-2 space-y-2">
            <Input placeholder="Buscar por source ou dedup key..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs" />
            <div className="flex gap-1">
              {["all", "pending", "processing", "processed", "failed"].map(s => (
                <Badge key={s} variant={statusFilter === s ? "default" : "outline"} className="cursor-pointer text-[10px] px-1.5 py-0.5" onClick={() => setStatusFilter(s)}>
                  {s === "all" ? "Todos" : s}
                </Badge>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1 px-3 pb-3">
            <div className="mt-2 space-y-1.5">
              {loading && webhooks.length === 0 && <div className="text-center py-8 text-xs text-muted-foreground">Carregando...</div>}
              {!loading && filtered.length === 0 && <div className="text-center py-8 text-xs text-muted-foreground">Nenhum webhook encontrado</div>}
              {filtered.map(w => {
                const isExpanded = expandedId === w.id;
                return (
                  <div key={w.id} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 p-2 hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => setExpandedId(isExpanded ? null : w.id)}>
                      {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                      {statusIcon(w.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">{w.source}</span>
                          {w.signature_verified && <ShieldCheck className="h-3 w-3 text-emerald-500" />}
                          {w.signature && !w.signature_verified && <ShieldAlert className="h-3 w-3 text-amber-500" />}
                          {(w.retry_count || 0) > 0 && <Badge variant="outline" className="text-[9px] px-1">retry {w.retry_count}</Badge>}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{formatDate(w.created_at)}</div>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); handleReplay(w); }} disabled={replayingId === w.id}>
                          <Play className={`h-3 w-3 ${replayingId === w.id ? "animate-pulse" : ""}`} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); copyPayload(w.body); }}>
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={e => { e.stopPropagation(); handleDelete(w.id); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t p-2 space-y-2 bg-muted/20">
                        <div className="grid grid-cols-2 gap-1 text-[10px]">
                          <div><span className="text-muted-foreground">Source:</span><span className="ml-1 font-medium">{w.source}</span></div>
                          <div><span className="text-muted-foreground">Status:</span><Badge variant="outline" className="ml-1 text-[9px] px-1">{w.status || "pending"}</Badge></div>
                          <div><span className="text-muted-foreground">HMAC:</span><span className="ml-1">{w.signature_verified ? "✅ Verificado" : w.signature ? "⚠️ Não verificado" : "—"}</span></div>
                          <div><span className="text-muted-foreground">Retries:</span><span className="ml-1">{w.retry_count || 0}/{w.max_retries || 5}</span></div>
                          {w.dedup_key && (
                            <div className="col-span-2"><span className="text-muted-foreground">Dedup:</span><span className="ml-1 font-mono text-[9px]">{w.dedup_key.slice(0, 24)}...</span></div>
                          )}
                          {w.processed_at && (
                            <div className="col-span-2"><span className="text-muted-foreground">Processado:</span><span className="ml-1">{formatDate(w.processed_at)}</span></div>
                          )}
                          {w.error_message && (
                            <div className="col-span-2"><span className="text-destructive">Erro:</span><span className="ml-1 text-destructive">{w.error_message}</span></div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-semibold text-muted-foreground">Body</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyPayload(w.body)}><Copy className="h-2.5 w-2.5" /></Button>
                          </div>
                          <pre className="text-[9px] font-mono bg-background border rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(w.body, null, 2)}</pre>
                        </div>
                        {w.headers && Object.keys(w.headers).length > 0 && (
                          <div>
                            <span className="text-[10px] font-semibold text-muted-foreground">Headers</span>
                            <pre className="text-[9px] font-mono bg-background border rounded p-2 max-h-24 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(w.headers, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="px-3 py-2 border-t flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{filtered.length} webhooks</span>
            <div className="flex gap-2">
              <span className="flex items-center gap-0.5"><CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />{webhooks.filter(w => w.status === "processed").length}</span>
              <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5 text-amber-500" />{webhooks.filter(w => w.status === "pending").length}</span>
              <span className="flex items-center gap-0.5"><AlertCircle className="h-2.5 w-2.5 text-destructive" />{webhooks.filter(w => w.status === "failed").length}</span>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="triggers" className="flex-1 flex flex-col min-h-0 m-0">
          <ScrollArea className="flex-1 px-3 pb-3">
            <div className="mt-2 space-y-3">
              <p className="text-xs text-muted-foreground">Configure triggers para filtrar webhooks por evento e payload.</p>
              <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
                <h4 className="text-xs font-semibold">Novo Trigger</h4>
                <Input placeholder="Tipo de evento (ex: order.created)" value={newTrigger.event_type} onChange={e => setNewTrigger({ ...newTrigger, event_type: e.target.value })} className="h-7 text-xs" />
                <Input placeholder="Filtro de source (ex: stripe)" value={newTrigger.source_filter} onChange={e => setNewTrigger({ ...newTrigger, source_filter: e.target.value })} className="h-7 text-xs" />
                <div className="grid grid-cols-2 gap-1.5">
                  <Input placeholder="Caminho (ex: data.status)" value={newTrigger.payload_path} onChange={e => setNewTrigger({ ...newTrigger, payload_path: e.target.value })} className="h-7 text-xs" />
                  <Input placeholder="Valor esperado" value={newTrigger.payload_value} onChange={e => setNewTrigger({ ...newTrigger, payload_value: e.target.value })} className="h-7 text-xs" />
                </div>
                <Button size="sm" className="w-full text-xs h-7" onClick={addTrigger} disabled={!newTrigger.event_type}>Adicionar Trigger</Button>
              </div>

              {triggers.length === 0 && <div className="text-center py-6 text-xs text-muted-foreground">Nenhum trigger configurado</div>}
              {triggers.map(t => (
                <div key={t.id} className={`border rounded-lg p-2.5 space-y-1 ${t.enabled ? "" : "opacity-50"}`}>
                  <div className="flex items-center justify-between">
                    <Badge variant={t.enabled ? "default" : "outline"} className="text-[10px] px-1.5">{t.event_type}</Badge>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => saveTriggers(triggers.map(x => x.id === t.id ? { ...x, enabled: !x.enabled } : x))}>
                        {t.enabled ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <AlertCircle className="h-3 w-3" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => saveTriggers(triggers.filter(x => x.id !== t.id))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {t.payload_path && <div className="text-[10px] text-muted-foreground"><span className="font-mono">{t.payload_path}</span>{t.payload_value && <span> = <span className="font-mono text-foreground">{t.payload_value}</span></span>}</div>}
                </div>
              ))}

              <div className="border rounded-lg p-3 bg-muted/30 space-y-2 mt-4">
                <h4 className="text-xs font-semibold">URL do Webhook</h4>
                <p className="text-[10px] text-muted-foreground">Configure serviços externos para enviar webhooks para:</p>
                <div className="flex items-center gap-1">
                  <code className="text-[9px] font-mono bg-background border rounded px-2 py-1 flex-1 truncate">{webhookWorkerUrl}</code>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { navigator.clipboard.writeText(webhookWorkerUrl); toast({ title: "URL copiada!" }); }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Headers: <code className="font-mono">X-Flow-Id: {flowId.slice(0, 8)}...</code> e opcionalmente <code className="font-mono">X-Dedup-Key</code> + <code className="font-mono">X-Webhook-Secret</code> (HMAC-SHA256).
                </p>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
