/**
 * DeployPanel — Painel de deploy no builder
 * Gera slug, cria deployments, gera código embed, configura WhatsApp
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import {
  X,
  Globe,
  MessageSquare,
  Code,
  Copy,
  Check,
  Rocket,
  BarChart3,
  RefreshCw,
  ExternalLink,
  Wifi,
  WifiOff,
  FlaskConical,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

interface DeployPanelProps {
  flowId: string;
  flowName: string;
  onClose: () => void;
}

interface DeploymentInfo {
  id: string;
  channel: string;
  endpoint_slug: string | null;
  is_active: boolean | null;
  channel_config: Record<string, unknown> | null;
  created_at: string | null;
}

interface DeployMetrics {
  totalExecutions: number;
  errorCount: number;
  avgLatencyMs: number;
}

interface EvolutionInstance {
  id: string;
  instance_name: string;
  status: string | null;
  api_url: string | null;
}

export function DeployPanel({ flowId, flowName, onClose }: DeployPanelProps) {
  const [slug, setSlug] = useState("");
  const [deployments, setDeployments] = useState<DeploymentInfo[]>([]);
  const [metrics, setMetrics] = useState<DeployMetrics>({ totalExecutions: 0, errorCount: 0, avgLatencyMs: 0 });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [webActive, setWebActive] = useState(false);
  const [whatsappActive, setWhatsappActive] = useState(false);
  const [evolutionInstances, setEvolutionInstances] = useState<EvolutionInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState("");
  const [canaryPercent, setCanaryPercent] = useState(0);
  const [canaryUpdating, setCanaryUpdating] = useState(false);
  const [flowStatus, setFlowStatus] = useState<string>("draft");

  // Generate slug from flow name
  useEffect(() => {
    const base = flowName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setSlug(base || "agente");
  }, [flowName]);

  // Load existing deployments + Evolution instances + flow status
  useEffect(() => {
    loadDeployments();
    loadMetrics();
    loadEvolutionInstances();
    loadFlowStatus();
  }, [flowId]);

  const loadFlowStatus = async () => {
    const { data } = await supabase
      .from("agent_flows")
      .select("status")
      .eq("id", flowId)
      .single();
    if (data) setFlowStatus(data.status ?? "draft");
  };

  const isTrial = flowStatus === "trial";
  const isPublished = flowStatus === "published" || flowStatus === "active";

  const graduateToProduction = async () => {
    setLoading(true);
    // Update flow status to published
    const { error } = await supabase
      .from("agent_flows")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", flowId);
    
    if (error) {
      toast({ title: "Erro ao graduar agente", description: error.message, variant: "destructive" });
    } else {
      // Update deployment config to production mode
      const webDep = deployments.find(d => d.channel === "web");
      if (webDep) {
        await (supabase as any)
          .from("agent_deployments")
          .update({ deployment_config: { mode: "production" }, updated_at: new Date().toISOString() })
          .eq("id", webDep.id);
      }
      setFlowStatus("published");
      toast({ title: "🎉 Agente graduado para Produção!" });
    }
    setLoading(false);
  };

  const loadEvolutionInstances = async () => {
    const { data } = await (supabase as any)
      .from("evolution_instances")
      .select("id, instance_name, status, api_url")
      .eq("is_active", true);
    if (data) {
      const instances = data as EvolutionInstance[];
      setEvolutionInstances(instances);
      if (!selectedInstance && instances.length > 0) {
        setSelectedInstance(instances[0].instance_name);
      }
    }
  };

  const loadDeployments = async () => {
    const { data } = await supabase
      .from("agent_deployments")
      .select("id, channel, endpoint_slug, is_active, channel_config, created_at")
      .eq("flow_id", flowId);

    if (data) {
      const typed = (data as any[]).map((d) => ({
        ...d,
        channel_config: d.channel_config as Record<string, unknown> | null,
      }));
      setDeployments(typed);
      const webDep = typed.find((d) => d.channel === "web");
      const whatsappDep = typed.find((d) => d.channel === "whatsapp");
      if (webDep) {
        setSlug(webDep.endpoint_slug || slug);
        setWebActive(webDep.is_active || false);
      }
      if (whatsappDep) {
        setWhatsappActive(whatsappDep.is_active || false);
        const config = whatsappDep.channel_config;
        if (config && typeof config === "object" && "phone_number" in config) {
          setWhatsappNumber(config.phone_number as string);
        }
      }
    }
  };

  const loadMetrics = async () => {
    const { data: executions } = await supabase
      .from("agent_executions")
      .select("id, status, started_at, completed_at")
      .eq("flow_id", flowId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (executions && executions.length > 0) {
      const items = executions as Array<{ status: string; started_at: string | null; completed_at: string | null }>;
      const errors = items.filter((e) => e.status === "failed").length;
      const completed = items.filter((e) => e.started_at && e.completed_at);
      const avgMs = completed.length > 0
        ? completed.reduce((acc, e) => {
            const start = new Date(e.started_at!).getTime();
            const end = new Date(e.completed_at!).getTime();
            return acc + (end - start);
          }, 0) / completed.length
        : 0;

      setMetrics({
        totalExecutions: executions.length,
        errorCount: errors,
        avgLatencyMs: Math.round(avgMs),
      });
    }
  };

  const deployChannel = async (channel: "web" | "whatsapp") => {
    setLoading(true);
    const existing = deployments.find((d) => d.channel === channel);

    const channelConfig = channel === "whatsapp"
      ? { phone_number: whatsappNumber, instance_name: selectedInstance, evolution_api: "v1", webhook_url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aetherforge-gateway` }
      : { widget_version: "1.0" };

    if (existing) {
      const { error } = await (supabase as any)
        .from("agent_deployments")
        .update({
          endpoint_slug: slug,
          is_active: true,
          channel_config: channelConfig,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        toast({ title: "Erro ao atualizar deploy", description: error.message, variant: "destructive" });
      } else {
        toast({ title: `Deploy ${channel} atualizado!` });
      }
    } else {
      const { error } = await (supabase as any)
        .from("agent_deployments")
        .insert({
          flow_id: flowId,
          channel,
          endpoint_slug: slug,
          is_active: true,
          flow_version: 1,
          channel_config: channelConfig,
        });

      if (error) {
        toast({ title: "Erro ao criar deploy", description: error.message, variant: "destructive" });
      } else {
        toast({ title: `Deploy ${channel} criado!` });
      }
    }

    await loadDeployments();
    setLoading(false);
  };

  const toggleDeploy = async (deployId: string, active: boolean) => {
    await (supabase as any)
      .from("agent_deployments")
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq("id", deployId);
    await loadDeployments();
  };

  const gatewayUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aetherforge-gateway`;
  const apiProxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aetherforge-api-proxy`;
  const embedCode = `<!-- AetherForge Widget -->
<script>
(function() {
  var w = document.createElement('div');
  w.id = 'aetherforge-widget';
  document.body.appendChild(w);
  
  var s = document.createElement('script');
  s.src = '${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aetherforge-widget?slug=${slug}';
  s.async = true;
  document.body.appendChild(s);
})();
</script>`;

  const apiExample = `// API Pública — Enviar mensagem para o agente
const response = await fetch('${apiProxyUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'SUA_API_KEY_AQUI'
  },
  body: JSON.stringify({
    slug: '${slug}',
    message: 'Olá!',
    session_id: 'opcional-session-id',
    channel: 'api'
  })
});
const data = await response.json();
console.log(data.output);`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="w-96 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Deploy</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Lifecycle Status Banner */}
      <div className={`p-3 border-b flex items-center gap-2 ${isTrial ? "bg-amber-500/10" : isPublished ? "bg-emerald-500/10" : "bg-muted"}`}>
        {isTrial ? (
          <>
            <FlaskConical className="h-4 w-4 text-amber-500" />
            <div className="flex-1">
              <span className="text-xs font-medium text-amber-600">Modo Trial</span>
              <p className="text-[10px] text-muted-foreground">Agente ativo para testes. Widget público bloqueado.</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-amber-500/30 text-amber-600 hover:bg-amber-500/10" onClick={graduateToProduction} disabled={loading}>
              <ShieldCheck className="h-3 w-3" />
              Graduar
            </Button>
          </>
        ) : isPublished ? (
          <>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <div className="flex-1">
              <span className="text-xs font-medium text-emerald-600">Produção</span>
              <p className="text-[10px] text-muted-foreground">Agente ativo para uso público.</p>
            </div>
          </>
        ) : (
          <>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <span className="text-xs font-medium">Rascunho</span>
              <p className="text-[10px] text-muted-foreground">Agente não implantado.</p>
            </div>
          </>
        )}
      </div>

      {/* Slug */}
      <div className="p-4 border-b space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Slug do agente</Label>
        <div className="flex gap-2">
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            className="h-8 text-sm font-mono"
            placeholder="meu-agente"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Endpoint: <code className="text-primary">/agent/{slug}/message</code>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="channels" className="p-4">
           <TabsList className="w-full">
            <TabsTrigger value="channels" className="flex-1 text-xs">Canais</TabsTrigger>
            <TabsTrigger value="embed" className="flex-1 text-xs">Embed</TabsTrigger>
            <TabsTrigger value="canary" className="flex-1 text-xs">Canary</TabsTrigger>
            <TabsTrigger value="metrics" className="flex-1 text-xs">Métricas</TabsTrigger>
          </TabsList>

          {/* Channels Tab */}
          <TabsContent value="channels" className="space-y-4 mt-4">
            {/* Web Widget */}
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Web Widget</span>
                </div>
                {deployments.find((d) => d.channel === "web") && (
                  <Switch
                    checked={webActive}
                    onCheckedChange={(v) => {
                      const dep = deployments.find((d) => d.channel === "web");
                      if (dep) toggleDeploy(dep.id, v);
                      setWebActive(v);
                    }}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Chat bubble embeddable em qualquer site
              </p>
              <Button
                size="sm"
                className="w-full gap-1"
                onClick={() => deployChannel("web")}
                disabled={loading || !slug}
              >
                {deployments.find((d) => d.channel === "web") ? "Atualizar" : "Ativar"} Web
              </Button>
            </div>

            {/* WhatsApp */}
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">WhatsApp</span>
                </div>
                {deployments.find((d) => d.channel === "whatsapp") && (
                  <Switch
                    checked={whatsappActive}
                    onCheckedChange={(v) => {
                      const dep = deployments.find((d) => d.channel === "whatsapp");
                      if (dep) toggleDeploy(dep.id, v);
                      setWhatsappActive(v);
                    }}
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Instância Evolution</Label>
                <Select value={selectedInstance} onValueChange={setSelectedInstance}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Selecionar instância" />
                  </SelectTrigger>
                  <SelectContent>
                    {evolutionInstances.map((inst) => (
                      <SelectItem key={inst.id} value={inst.instance_name}>
                        <div className="flex items-center gap-2">
                          {inst.status === "open" || inst.status === "connected" ? (
                            <Wifi className="h-3 w-3 text-green-500" />
                          ) : (
                            <WifiOff className="h-3 w-3 text-destructive" />
                          )}
                          {inst.instance_name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Número WhatsApp</Label>
                <Input
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="5511999999999"
                  className="h-8 text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Via Evolution API V1 — Webhook automático
              </p>
              <div className="bg-muted rounded p-2">
                <code className="text-[10px] break-all text-muted-foreground">
                  Webhook: {gatewayUrl}
                </code>
              </div>
              <Button
                size="sm"
                className="w-full gap-1"
                onClick={() => deployChannel("whatsapp")}
                disabled={loading || !slug || !selectedInstance}
              >
                {deployments.find((d) => d.channel === "whatsapp") ? "Atualizar" : "Ativar"} WhatsApp
              </Button>
            </div>

            {/* API */}
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">API REST</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Integre via POST direto ao gateway
              </p>
              <div className="bg-muted rounded p-2">
                <code className="text-xs break-all">
                  POST {gatewayUrl}
                </code>
              </div>
            </div>
          </TabsContent>

          {/* Embed Tab */}
          <TabsContent value="embed" className="space-y-4 mt-4">
            {isTrial && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-600">Widget público bloqueado em modo Trial. Gradue para Produção para liberar o embed.</p>
              </div>
            )}
            {/* Widget Embed Code */}
            <div className={`space-y-2 ${isTrial ? "opacity-50 pointer-events-none" : ""}`}>
              <Label className="text-xs font-medium">Widget HTML (copie e cole)</Label>
              <div className="relative">
                <pre className="bg-muted rounded-lg p-3 text-xs overflow-auto max-h-40 font-mono">
                  {embedCode}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 h-7 w-7"
                  onClick={() => copyToClipboard(embedCode, "embed")}
                >
                  {copied === "embed" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>

            {/* API Example */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">API REST (JavaScript)</Label>
              <div className="relative">
                <pre className="bg-muted rounded-lg p-3 text-xs overflow-auto max-h-48 font-mono">
                  {apiExample}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 h-7 w-7"
                  onClick={() => copyToClipboard(apiExample, "api")}
                >
                  {copied === "api" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Canary Tab */}
          <TabsContent value="canary" className="space-y-4 mt-4">
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Canary Deploy</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Direcione uma % do tráfego para a versão mais recente. Se a qualidade cair, o rollback é automático.
              </p>
              <div className="space-y-2">
                <Label className="text-xs">Tráfego canary: {canaryPercent}%</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={canaryPercent}
                  onChange={(e) => setCanaryPercent(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0% (desligado)</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
              <div className="bg-muted rounded p-2">
                <div className="flex justify-between text-xs">
                  <span>Stable: {100 - canaryPercent}%</span>
                  <span className="text-amber-500">Canary: {canaryPercent}%</span>
                </div>
                <div className="w-full bg-background rounded-full h-2 mt-1 overflow-hidden flex">
                  <div className="bg-emerald-500 h-2 transition-all" style={{ width: `${100 - canaryPercent}%` }} />
                  <div className="bg-amber-500 h-2 transition-all" style={{ width: `${canaryPercent}%` }} />
                </div>
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={canaryUpdating}
                onClick={async () => {
                  setCanaryUpdating(true);
                  const webDep = deployments.find(d => d.channel === "web");
                  if (webDep) {
                    await (supabase as any)
                      .from("agent_deployments")
                      .update({ canary_percent: canaryPercent, updated_at: new Date().toISOString() })
                      .eq("id", webDep.id);
                    toast({ title: `Canary atualizado para ${canaryPercent}%` });
                  } else {
                    toast({ title: "Deploy web necessário primeiro", variant: "destructive" });
                  }
                  setCanaryUpdating(false);
                }}
              >
                {canaryUpdating ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
                Aplicar Canary
              </Button>
              <p className="text-[10px] text-muted-foreground italic">
                Auto-rollback: se quality score canary cair &gt;10% vs baseline por 1h
              </p>
            </div>
          </TabsContent>

          {/* Metrics Tab */}
          <TabsContent value="metrics" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Últimas 100 execuções</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadMetrics}>
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="border rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-primary">{metrics.totalExecutions}</div>
                <div className="text-xs text-muted-foreground">Execuções</div>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-destructive">{metrics.errorCount}</div>
                <div className="text-xs text-muted-foreground">Erros</div>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-500">{metrics.avgLatencyMs}ms</div>
                <div className="text-xs text-muted-foreground">Latência média</div>
              </div>
            </div>

            {metrics.totalExecutions > 0 && (
              <div className="border rounded-lg p-3">
                <div className="text-xs font-medium mb-2">Taxa de sucesso</div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{
                      width: `${((metrics.totalExecutions - metrics.errorCount) / metrics.totalExecutions) * 100}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {Math.round(((metrics.totalExecutions - metrics.errorCount) / metrics.totalExecutions) * 100)}%
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
