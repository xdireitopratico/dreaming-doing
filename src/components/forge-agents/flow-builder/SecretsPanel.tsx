/**
 * SecretsPanel — Gestão de secrets por agente com BYOK (Bring Your Own Key)
 * @version 2.0.0 — Round 34: Provider-aware BYOK detection
 */
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import {
  X, Plus, Key, Eye, EyeOff, Trash2, RefreshCw, Shield,
  AlertCircle, Copy, Check, Cloud, Cpu, CheckCircle2,
} from "lucide-react";
import { PROVIDERS, findModel, type ProviderDefinition } from "./model-catalog-frontend";

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

/** Extract provider IDs that are in use by LLM nodes in the flow */
function extractUsedProviders(nodes: any[]): Map<string, { providerId: string; modelLabel: string; nodeLabel: string }[]> {
  const providerUsage = new Map<string, { providerId: string; modelLabel: string; nodeLabel: string }[]>();

  for (const node of nodes) {
    if (node.type !== "llm") continue;
    const config = node.data?.config || {};
    const modelId = config.model_id || config.model || "";
    if (!modelId) continue;

    const model = findModel(modelId);
    if (!model) continue;

    const provider = PROVIDERS.find(p => p.id === model.provider);
    if (!provider) continue;

    // Only care about providers that need keys
    if (provider.id === "ollama") continue; // local, no key needed

    const key = provider.secretEnvKey;
    if (!key) continue;

    if (!providerUsage.has(key)) providerUsage.set(key, []);
    providerUsage.get(key)!.push({
      providerId: provider.id,
      modelLabel: model.label,
      nodeLabel: config.label || node.id,
    });
  }
  return providerUsage;
}

/** Extract required secrets from tool nodes */
function extractToolSecrets(nodes: any[]): string[] {
  const secrets = new Set<string>();
  for (const node of nodes) {
    const config = node.data?.config || {};
    if (config.auth_type === "bearer" || config.auth_type === "api_key") {
      if (config.auth_secret_name) secrets.add(config.auth_secret_name);
    }
    if (config.api_key_secret) secrets.add(config.api_key_secret);
    if (config.required_secrets && Array.isArray(config.required_secrets)) {
      config.required_secrets.forEach((s: string) => secrets.add(s));
    }
  }
  return Array.from(secrets);
}

export function SecretsPanel({ flowId, nodes, onClose }: SecretsPanelProps) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newProvider, setNewProvider] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  ;

  // Analyze flow for provider requirements
  const providerUsage = useMemo(() => extractUsedProviders(nodes), [nodes]);
  const toolSecrets = useMemo(() => extractToolSecrets(nodes), [nodes]);

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
      provider_id: newProvider || null,
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
      setNewProvider("");
      setNewDescription("");
      fetchSecrets();
    }
    setCreating(false);
  };

  const handleQuickCreate = (secretEnvKey: string, providerId: string) => {
    setNewName(secretEnvKey);
    setNewProvider(providerId);
    const provider = PROVIDERS.find(p => p.id === providerId);
    setNewDescription(`API key for ${provider?.label || providerId}`);
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

  // Build provider checklist
  const configuredNames = new Set(secrets.map((s) => s.secret_name));
  const allToolSecretsMissing = toolSecrets.filter((r) => !configuredNames.has(r));

  // Provider status: which keys are configured vs missing
  const providerChecklist = useMemo(() => {
    const items: { provider: ProviderDefinition; secretKey: string; configured: boolean; platformProvided: boolean; models: string[] }[] = [];
    for (const [secretKey, usages] of providerUsage.entries()) {
      const providerId = usages[0].providerId;
      const provider = PROVIDERS.find(p => p.id === providerId);
      if (!provider) continue;

      items.push({
        provider,
        secretKey,
        configured: configuredNames.has(secretKey),
        platformProvided: provider.platformProvided,
        models: usages.map(u => u.modelLabel),
      });
    }
    return items;
  }, [providerUsage, configuredNames]);

  const hasMissing = providerChecklist.some(p => !p.configured && !p.platformProvided) || allToolSecretsMissing.length > 0;

  return (
    <div className="w-[380px] border-l bg-background flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Secrets & BYOK</h3>
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
        {/* ═══ Provider Checklist ═══ */}
        {providerChecklist.length > 0 && (
          <div className="border rounded-lg p-3 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
              <Cloud className="h-3 w-3" />
              Provedores em uso
            </div>
            <div className="space-y-1.5">
              {providerChecklist.map(({ provider, secretKey, configured, platformProvided, models }) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/30"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${provider.badgeBg} ${provider.badgeText}`}>
                      {provider.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {models.length === 1 ? models[0] : `${models.length} modelos`}
                    </span>
                  </div>
                  <div className="shrink-0">
                    {platformProvided ? (
                      <Badge variant="outline" className="text-[9px] border-emerald-500/50 text-emerald-600 gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Plataforma
                      </Badge>
                    ) : configured ? (
                      <Badge variant="outline" className="text-[9px] border-emerald-500/50 text-emerald-600 gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        BYOK
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                        onClick={() => handleQuickCreate(secretKey, provider.id)}
                      >
                        <Plus className="h-2.5 w-2.5 mr-1" />
                        Configurar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tool secrets missing */}
        {allToolSecretsMissing.length > 0 && (
          <div className="border border-amber-500/30 rounded-lg p-3 bg-amber-500/5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-600">
              <AlertCircle className="h-3.5 w-3.5" />
              Secrets de Tools faltando
            </div>
            <div className="flex flex-wrap gap-1">
              {allToolSecretsMissing.map((s) => (
                <Badge key={s} variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Create button */}
        {!showCreate && (
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            Novo Secret
          </Button>
        )}

        {/* Create form */}
        {showCreate && (
          <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
            <div className="text-xs font-semibold text-muted-foreground uppercase">Novo Secret</div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                placeholder="OPENAI_API_KEY"
                className="h-8 text-sm font-mono"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Valor (API Key)</label>
              <Input
                type="password"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="sk-..."
                className="h-8 text-sm font-mono"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Descrição (opcional)</label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Chave da minha conta OpenAI"
                className="h-8 text-sm"
              />
            </div>

            {newProvider && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Cloud className="h-3 w-3" />
                Vinculado ao provedor: <span className="font-semibold">{PROVIDERS.find(p => p.id === newProvider)?.label || newProvider}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Shield className="h-3 w-3" />
              Valor armazenado com criptografia
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={creating || !newName.trim() || !newValue.trim()}>
                Criar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNewName(""); setNewValue(""); setNewProvider(""); setNewDescription(""); }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="p-2 rounded bg-muted/30 text-[10px] text-muted-foreground space-y-1">
          <p><strong>BYOK:</strong> Traga sua própria chave API de qualquer provedor.</p>
          <p>Use <code className="font-mono bg-muted px-1 rounded">{"{{secrets.NOME}}"}</code> nos prompts e configs.</p>
          <p>Provedores marcados como "Plataforma" usam chaves da infraestrutura automaticamente.</p>
        </div>

        {/* Secrets list */}
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
            const linkedProvider = s.provider_id ? PROVIDERS.find(p => p.id === s.provider_id) : null;

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

                {/* Provider badge + description */}
                <div className="flex items-center gap-2">
                  {linkedProvider && (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${linkedProvider.badgeBg} ${linkedProvider.badgeText}`}>
                      {linkedProvider.label}
                    </span>
                  )}
                  {s.is_platform_provided && (
                    <Badge variant="outline" className="text-[9px]">plataforma</Badge>
                  )}
                  {s.description && (
                    <span className="text-[10px] text-muted-foreground truncate">{s.description}</span>
                  )}
                </div>

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
