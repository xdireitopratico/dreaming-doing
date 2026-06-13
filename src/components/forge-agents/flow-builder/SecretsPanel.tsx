/**
 * SecretsPanel — Gestão de secrets de operação do agente (tools, integrações)
 * LLM providers ficam em /api (connectors); não duplicar aqui.
 */
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import {
  X, Plus, Key, Eye, EyeOff, Trash2, RefreshCw, Shield,
  AlertCircle, Copy, Check, Play, Loader2,
} from "lucide-react";
import { extractFlowTools, extractToolSecrets } from "./flow-tool-secrets";
import { testToolHealth, type ToolHealthStatus } from "@/lib/tool-health-test";

interface Secret {
  id: string;
  secret_name: string;
  encrypted_value: string;
  encryption_key_id: string;
  tenant_id: string;
  provider_id: string | null;
  is_platform_provided: boolean | null;
  secret_type: string | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
  access_count: number | null;
  last_accessed_at: string | null;
  rotated_at: string | null;
}

interface SecretsPanelProps {
  flowId: string;
  nodes: any[];
  onClose: () => void;
}

function maskValue(val: string): string {
  if (val.length <= 8) return "••••••••";
  return val.slice(0, 4) + "••••" + val.slice(-4);
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function SecretsPanel({ flowId, nodes, onClose }: SecretsPanelProps) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toolHealth, setToolHealth] = useState<Record<string, ToolHealthStatus>>({});
  const [testingTool, setTestingTool] = useState<string | null>(null);

  const toolSecrets = useMemo(() => extractToolSecrets(nodes), [nodes]);
  const flowTools = useMemo(() => extractFlowTools(nodes), [nodes]);

  const fetchSecrets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tenant_secrets")
      .select("*")
      .eq("tenant_id", flowId)
      .order("secret_name");

    if (!error && data) setSecrets(data as unknown as Secret[]);
    setLoading(false);
  };

  useEffect(() => { fetchSecrets(); }, [flowId]);

  const handleCreate = async () => {
    if (!newName.trim() || !newValue.trim()) return;
    setCreating(true);

    const { data: userData } = await supabase.auth.getUser();
    const encodedValue = btoa(newValue);
    const secretName = newName.trim().toUpperCase().replace(/\s+/g, "_");

    const { error } = await supabase.from("tenant_secrets").insert({
      tenant_id: flowId,
      secret_name: secretName,
      encrypted_value: encodedValue,
      encryption_key_id: "frontend-base64",
      provider_id: null,
      is_platform_provided: false,
      secret_type: "api_key",
      description: newDescription || null,
      created_by: userData?.user?.id || null,
    } as any);

    if (error) {
      toast({ title: "Erro ao criar secret", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Secret criado!" });
      setShowCreate(false);
      setNewName("");
      setNewValue("");
      setNewDescription("");
      await fetchSecrets();

      const linkedTools = flowTools.filter((t) => t.requiredSecrets.includes(secretName));
      if (linkedTools.length === 1) {
        void handleTestTool(linkedTools[0].toolName);
      }
    }
    setCreating(false);
  };

  const handleQuickCreate = (secretName: string) => {
    setNewName(secretName);
    setNewDescription(`Secret de operação: ${secretName}`);
    setShowCreate(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("tenant_secrets").delete().eq("id", id);
    setSecrets((s) => s.filter((x) => x.id !== id));
    toast({ title: "Secret removido" });
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCopy = (name: string) => {
    navigator.clipboard.writeText(`{{secrets.${name}}}`);
    setCopiedId(name);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const configuredNames = new Set(secrets.map((s) => s.secret_name));
  const toolSecretsMissing = toolSecrets.filter((r) => !configuredNames.has(r));

  const healthColor: Record<ToolHealthStatus, string> = {
    healthy: "text-emerald-500",
    degraded: "text-amber-500",
    unhealthy: "text-red-500",
    idle: "text-muted-foreground",
    testing: "text-primary",
  };

  const healthLabel: Record<ToolHealthStatus, string> = {
    healthy: "OK",
    degraded: "Parcial",
    unhealthy: "Falhou",
    idle: "—",
    testing: "Testando…",
  };

  const handleTestTool = async (toolName: string) => {
    setTestingTool(toolName);
    setToolHealth((prev) => ({ ...prev, [toolName]: "testing" }));
    const result = await testToolHealth(flowId, toolName);
    setToolHealth((prev) => ({ ...prev, [toolName]: result.health }));
    setTestingTool(null);

    if (result.health === "healthy") {
      toast({ title: `${toolName}: OK` });
    } else if (result.health === "degraded") {
      toast({
        title: `${toolName}: conexão parcial`,
        description: result.error?.slice(0, 120) || "Provider respondeu com erro esperado",
      });
    } else {
      toast({
        title: `${toolName}: falhou`,
        description: result.error || "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-[380px] border-l bg-background flex flex-col shrink-0 overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Secrets do Agente</h3>
          <Badge variant="secondary" className="text-xs">{secrets.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchSecrets}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {flowTools.length > 0 && (
          <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
            <div className="text-xs font-medium text-muted-foreground">Health das tools no flow</div>
            <div className="space-y-1.5">
              {flowTools.map((tool) => {
                const status = toolHealth[tool.toolName] || "idle";
                const missing = tool.requiredSecrets.filter((s) => !configuredNames.has(s));
                return (
                  <div key={`${tool.nodeId}-${tool.toolName}`} className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 flex-1 justify-start text-[10px] font-mono px-2"
                      disabled={testingTool === tool.toolName || missing.length > 0}
                      onClick={() => handleTestTool(tool.toolName)}
                      title={missing.length ? `Configure: ${missing.join(", ")}` : "Testar tool"}
                    >
                      {testingTool === tool.toolName ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3 mr-1" />
                      )}
                      {tool.toolName}
                    </Button>
                    <span className={`text-[10px] font-medium w-14 text-right ${healthColor[status]}`}>
                      {healthLabel[status]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {toolSecretsMissing.length > 0 && (
          <div className="border border-amber-500/30 rounded-lg p-3 bg-amber-500/5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-600">
              <AlertCircle className="h-3.5 w-3.5" />
              Secrets de tools faltando
            </div>
            <div className="flex flex-wrap gap-1">
              {toolSecretsMissing.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                  onClick={() => handleQuickCreate(s)}
                >
                  <Plus className="h-2.5 w-2.5 mr-1" />
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {!showCreate && (
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            Novo Secret
          </Button>
        )}

        {showCreate && (
          <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
            <div className="text-xs font-semibold text-muted-foreground uppercase">Novo Secret</div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                placeholder="RESEND_API_KEY"
                className="h-8 text-sm font-mono"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Valor (API Key)</label>
              <Input
                type="password"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="re_..."
                className="h-8 text-sm font-mono"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Descrição (opcional)</label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Chave Resend para envio de e-mail"
                className="h-8 text-sm"
              />
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Shield className="h-3 w-3" />
              Valor armazenado com criptografia
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={creating || !newName.trim() || !newValue.trim()}>
                Criar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNewName(""); setNewValue(""); setNewDescription(""); }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <div className="p-2 rounded bg-muted/30 text-[10px] text-muted-foreground space-y-1">
          <p>Chaves de <strong>tools</strong> (e-mail, WhatsApp, Firecrawl do agente, etc.) ficam aqui.</p>
          <p>Chaves de <strong>LLM</strong> (Groq, OpenAI, Gemini…) ficam em <strong>/api</strong>.</p>
          <p>Use <code className="font-mono bg-muted px-1 rounded">{"{{secrets.NOME}}"}</code> nos prompts e configs.</p>
        </div>

        {loading ? (
          <div className="text-center text-xs text-muted-foreground py-8">Carregando...</div>
        ) : secrets.length === 0 && !showCreate ? (
          <div className="text-center py-8 space-y-2">
            <Key className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Nenhum secret configurado</p>
          </div>
        ) : (
          secrets.map((s) => {
            const isRevealed = revealedIds.has(s.id);
            const decodedValue = (() => { try { return atob(s.encrypted_value); } catch { return s.encrypted_value; } })();

            return (
              <div key={s.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Key className="h-3 w-3 text-primary shrink-0" />
                    <span className="text-sm font-mono font-medium truncate">{s.secret_name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy(s.secret_name)}>
                      {copiedId === s.secret_name ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleReveal(s.id)}>
                      {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {s.description && (
                  <span className="text-[10px] text-muted-foreground truncate block">{s.description}</span>
                )}

                <div className="text-xs font-mono text-muted-foreground bg-muted/50 rounded px-2 py-1">
                  {isRevealed ? decodedValue : maskValue(decodedValue)}
                </div>

                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>Criado: {formatDate(s.created_at)}</span>
                  {s.access_count != null && <span>Acessos: {s.access_count}</span>}
                  {s.rotated_at && <span>Rotação: {formatDate(s.rotated_at)}</span>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}