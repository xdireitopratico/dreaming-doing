/**
 * ToolRegistryPanel — Gerenciamento do Tool Registry
 * Rodada 10: Listagem, CRUD, Tester inline, Import/Export
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  X, Plus, Search, Play, Download, Upload, Trash2, Edit2, Check,
  Wrench, RefreshCw, ChevronDown, ChevronUp, Filter,
} from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface ToolEntry {
  id: string;
  name: string;
  display_name: string;
  category: string | null;
  description: string | null;
  input_schema: Json;
  output_schema: Json;
  executor_type: string;
  executor_config: Json;
  is_active: boolean | null;
  is_builtin: boolean | null;
  requires_idempotency: boolean | null;
  rate_limit_per_minute: number | null;
  sandbox_level: string | null;
  icon: string | null;
  required_secrets: string[] | null;
  created_at: string | null;
}

const CATEGORIES = [
  { value: "all", label: "Todas" },
  { value: "ai", label: "AI" },
  { value: "communication", label: "Comunicação" },
  { value: "data", label: "Dados" },
  { value: "integration", label: "Integração" },
  { value: "logic", label: "Lógica" },
  { value: "security", label: "Segurança" },
  { value: "legal", label: "Jurídico" },
  { value: "custom", label: "Customizada" },
];

interface ToolRegistryPanelProps {
  onClose: () => void;
  onSelectTool?: (toolName: string) => void;
}

export function ToolRegistryPanel({ onClose, onSelectTool }: ToolRegistryPanelProps) {
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("list");
  const [editingTool, setEditingTool] = useState<Partial<ToolEntry> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [testInput, setTestInput] = useState("{}");
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  ;

  const loadTools = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tool_registry")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      toast({ title: "Erro ao carregar tools", variant: "destructive" });
    } else {
      setTools((data || []) as unknown as ToolEntry[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { loadTools(); }, [loadTools]);

  const filteredTools = tools.filter((t) => {
    const matchSearch = !searchTerm ||
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = categoryFilter === "all" || t.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const getEndpointFromConfig = (config: Json): string => {
    if (config && typeof config === "object" && !Array.isArray(config)) {
      return (config as Record<string, unknown>).endpoint_url as string || "";
    }
    return "";
  };

  const handleSaveTool = async () => {
    if (!editingTool?.name || !editingTool?.display_name) {
      toast({ title: "Nome e Display Name são obrigatórios", variant: "destructive" });
      return;
    }

    const payload = {
      name: editingTool.name,
      display_name: editingTool.display_name,
      category: editingTool.category || "custom",
      description: editingTool.description || null,
      input_schema: (editingTool.input_schema || {}) as Json,
      output_schema: (editingTool.output_schema || {}) as Json,
      executor_type: editingTool.executor_type || "http",
      executor_config: (editingTool.executor_config || {}) as Json,
      is_active: editingTool.is_active ?? true,
      is_builtin: false,
      requires_idempotency: editingTool.requires_idempotency ?? false,
      rate_limit_per_minute: editingTool.rate_limit_per_minute || 60,
      sandbox_level: editingTool.sandbox_level || "standard",
      icon: editingTool.icon || null,
      required_secrets: editingTool.required_secrets || null,
    };

    if (isCreating) {
      const { error } = await supabase.from("tool_registry").insert(payload);
      if (error) {
        toast({ title: "Erro ao criar tool", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Tool criada!" });
    } else if (editingTool.id) {
      const { error } = await supabase
        .from("tool_registry")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editingTool.id);
      if (error) {
        toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Tool atualizada!" });
    }

    setEditingTool(null);
    setIsCreating(false);
    setActiveTab("list");
    loadTools();
  };

  const handleDeleteTool = async (id: string) => {
    const { error } = await supabase.from("tool_registry").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    } else {
      toast({ title: "Tool excluída" });
      loadTools();
    }
  };

  const handleTestTool = async () => {
    const endpoint = getEndpointFromConfig(editingTool?.executor_config || {});
    if (!endpoint) {
      setTestOutput(JSON.stringify({ error: "Endpoint URL não configurado no executor_config" }, null, 2));
      return;
    }

    // BUG 119 FIX: Only allow testing against the project's own edge functions or allowed domains
    try {
      const url = new URL(endpoint);
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const allowedHosts = [
        `${projectId}.supabase.co`,
        `${projectId}.functions.supabase.co`,
        "localhost",
      ];
      if (!allowedHosts.some(h => url.hostname === h || url.hostname.endsWith(`.${h}`))) {
        setTestOutput(JSON.stringify({ error: "Teste direto só é permitido para funções do projeto. Use o gateway para APIs externas." }, null, 2));
        return;
      }
    } catch {
      setTestOutput(JSON.stringify({ error: "URL inválida" }, null, 2));
      return;
    }

    setTestLoading(true);
    setTestOutput(null);
    try {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(testInput); } catch { /* empty */ }

      // BUG 118 FIX: Never send secrets client-side — use project auth instead
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {}),
      };

      const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(parsed),
        signal: AbortSignal.timeout(15000),
      });

      const body = await resp.text();
      let formatted: string;
      try { formatted = JSON.stringify(JSON.parse(body), null, 2); } catch { formatted = body; }
      setTestOutput(`Status: ${resp.status}\n\n${formatted}`);
    } catch (err: unknown) {
      setTestOutput(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTestLoading(false);
  };

  const handleExport = () => {
    const exportData = filteredTools.map(({ id, created_at, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tool-registry-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `${exportData.length} tools exportadas` });
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as Partial<ToolEntry>[];
        if (!Array.isArray(imported)) throw new Error("Formato inválido");

        let count = 0;
        for (const tool of imported) {
          if (!tool.name || !tool.display_name) continue;
          const { error } = await supabase.from("tool_registry").insert({
            name: tool.name,
            display_name: tool.display_name,
            category: tool.category || "custom",
            description: tool.description || null,
            input_schema: (tool.input_schema || {}) as Json,
            output_schema: (tool.output_schema || {}) as Json,
            executor_type: tool.executor_type || "http",
            executor_config: (tool.executor_config || {}) as Json,
            is_active: tool.is_active ?? true,
            is_builtin: false,
            requires_idempotency: tool.requires_idempotency ?? false,
            rate_limit_per_minute: tool.rate_limit_per_minute || 60,
            sandbox_level: tool.sandbox_level || "standard",
          });
          if (!error) count++;
        }
        toast({ title: `${count} tools importadas` });
        loadTools();
      } catch {
        toast({ title: "Erro ao importar JSON", variant: "destructive" });
      }
    };
    input.click();
  };

  const startCreate = () => {
    setEditingTool({
      name: "",
      display_name: "",
      category: "custom",
      description: "",
      input_schema: { type: "object", properties: {} },
      output_schema: { type: "object", properties: {} },
      executor_type: "http",
      executor_config: { endpoint_url: "", auth_type: "none" },
      is_active: true,
      is_builtin: false,
      requires_idempotency: false,
      rate_limit_per_minute: 60,
      sandbox_level: "standard",
      icon: null,
      required_secrets: null,
    });
    setIsCreating(true);
    setTestInput("{}");
    setTestOutput(null);
    setActiveTab("edit");
  };

  const startEdit = (tool: ToolEntry) => {
    setEditingTool({ ...tool });
    setIsCreating(false);
    setTestInput("{}");
    setTestOutput(null);
    setActiveTab("edit");
  };

  const updateExecutorConfig = (key: string, value: string) => {
    const current = (editingTool?.executor_config || {}) as Record<string, string>;
    const updated: Record<string, string> = { ...current, [key]: value };
    setEditingTool({ ...editingTool, executor_config: updated as unknown as Json });
  };

  const getConfigValue = (key: string): string => {
    const config = (editingTool?.executor_config || {}) as Record<string, unknown>;
    return (config[key] as string) || "";
  };

  return (
    <div className="w-[420px] border-l bg-background flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-yellow-500" />
          <span className="font-semibold text-sm">Tool Registry</span>
          <Badge variant="secondary" className="text-xs">{tools.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 grid grid-cols-2">
          <TabsTrigger value="list">Catálogo</TabsTrigger>
          <TabsTrigger value="edit">{isCreating ? "Nova Tool" : "Editar"}</TabsTrigger>
        </TabsList>

        {/* ===== LIST TAB ===== */}
        <TabsContent value="list" className="flex-1 flex flex-col overflow-hidden px-4 gap-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 h-8 text-xs"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="gap-1 text-xs flex-1" onClick={startCreate}>
              <Plus className="h-3 w-3" /> Nova Tool
            </Button>
            <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={handleImport}>
              <Upload className="h-3 w-3" /> Importar
            </Button>
            <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={handleExport}>
              <Download className="h-3 w-3" /> Exportar
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pb-2">
            {loading ? (
              <div className="text-xs text-muted-foreground text-center py-8">Carregando...</div>
            ) : filteredTools.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">Nenhuma tool encontrada</div>
            ) : (
              filteredTools.map((tool) => (
                <div key={tool.id} className="border rounded-md bg-muted/20">
                  <div
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setExpandedId(expandedId === tool.id ? null : tool.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">{tool.display_name}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tool.category}</Badge>
                        {tool.is_builtin && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">built-in</Badge>}
                        {!tool.is_active && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 opacity-60">Inativa</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5 font-mono">{tool.name}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {onSelectTool && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onSelectTool(tool.name); }}>
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); startEdit(tool); }}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      {expandedId === tool.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </div>
                  </div>
                  {expandedId === tool.id && (
                    <div className="px-3 pb-2 space-y-1 border-t">
                      {tool.description && <p className="text-[10px] text-muted-foreground mt-1">{tool.description}</p>}
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <div>
                          <span className="text-[10px] text-muted-foreground">Idempotente</span>
                          <p className="text-xs">{tool.requires_idempotency ? "Sim" : "Não"}</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground">Rate Limit</span>
                          <p className="text-xs">{tool.rate_limit_per_minute || "—"}/min</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground">Executor</span>
                          <p className="text-xs">{tool.executor_type}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 mt-1">
                        <Button variant="outline" size="sm" className="text-[10px] h-6 gap-1" onClick={() => startEdit(tool)}>
                          <Edit2 className="h-2.5 w-2.5" /> Editar
                        </Button>
                        {!tool.is_builtin && (
                          <Button variant="outline" size="sm" className="text-[10px] h-6 gap-1 text-destructive" onClick={() => handleDeleteTool(tool.id)}>
                            <Trash2 className="h-2.5 w-2.5" /> Excluir
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* ===== EDIT TAB ===== */}
        <TabsContent value="edit" className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {!editingTool ? (
            <div className="text-xs text-muted-foreground text-center py-8">
              Selecione uma tool para editar ou crie uma nova.
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Nome técnico *</Label>
                <Input
                  value={editingTool.name || ""}
                  onChange={(e) => setEditingTool({ ...editingTool, name: e.target.value })}
                  placeholder="minha_tool"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Display Name *</Label>
                <Input
                  value={editingTool.display_name || ""}
                  onChange={(e) => setEditingTool({ ...editingTool, display_name: e.target.value })}
                  placeholder="Minha Tool Customizada"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Categoria</Label>
                <Select value={editingTool.category || "custom"} onValueChange={(v) => setEditingTool({ ...editingTool, category: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter(c => c.value !== "all").map((c) => (
                      <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Textarea
                  value={editingTool.description || ""}
                  onChange={(e) => setEditingTool({ ...editingTool, description: e.target.value })}
                  placeholder="O que esta tool faz..."
                  className="text-xs min-h-[60px]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Executor Type</Label>
                <Select value={editingTool.executor_type || "http"} onValueChange={(v) => setEditingTool({ ...editingTool, executor_type: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http" className="text-xs">HTTP Request</SelectItem>
                    <SelectItem value="edge_function" className="text-xs">Edge Function</SelectItem>
                    <SelectItem value="python" className="text-xs">Python (KVM8)</SelectItem>
                    <SelectItem value="builtin" className="text-xs">Built-in</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Endpoint URL</Label>
                <Input
                  value={getConfigValue("endpoint_url")}
                  onChange={(e) => updateExecutorConfig("endpoint_url", e.target.value)}
                  placeholder="https://api.exemplo.com/tool"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Autenticação</Label>
                <Select value={getConfigValue("auth_type") || "none"} onValueChange={(v) => updateExecutorConfig("auth_type", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">Nenhuma</SelectItem>
                    <SelectItem value="bearer" className="text-xs">Bearer Token</SelectItem>
                    <SelectItem value="api_key" className="text-xs">API Key (header)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {getConfigValue("auth_type") === "bearer" && (
                <div className="space-y-1">
                  <Label className="text-xs">Token</Label>
                  <Input
                    type="password"
                    value={getConfigValue("token")}
                    onChange={(e) => updateExecutorConfig("token", e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              )}

              {getConfigValue("auth_type") === "api_key" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Header</Label>
                    <Input
                      value={getConfigValue("header_name") || "X-API-Key"}
                      onChange={(e) => updateExecutorConfig("header_name", e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Key</Label>
                    <Input
                      type="password"
                      value={getConfigValue("api_key")}
                      onChange={(e) => updateExecutorConfig("api_key", e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Input Schema (JSON)</Label>
                <Textarea
                  value={JSON.stringify(editingTool.input_schema || {}, null, 2)}
                  onChange={(e) => {
                    try { setEditingTool({ ...editingTool, input_schema: JSON.parse(e.target.value) }); } catch { /* typing */ }
                  }}
                  className="text-xs font-mono min-h-[80px]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Output Schema (JSON)</Label>
                <Textarea
                  value={JSON.stringify(editingTool.output_schema || {}, null, 2)}
                  onChange={(e) => {
                    try { setEditingTool({ ...editingTool, output_schema: JSON.parse(e.target.value) }); } catch { /* typing */ }
                  }}
                  className="text-xs font-mono min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingTool.requires_idempotency ?? false}
                    onCheckedChange={(v) => setEditingTool({ ...editingTool, requires_idempotency: v })}
                  />
                  <Label className="text-xs">Idempotente</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingTool.is_active ?? true}
                    onCheckedChange={(v) => setEditingTool({ ...editingTool, is_active: v })}
                  />
                  <Label className="text-xs">Ativa</Label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Rate Limit (rpm)</Label>
                  <Input
                    type="number"
                    value={editingTool.rate_limit_per_minute || 60}
                    onChange={(e) => setEditingTool({ ...editingTool, rate_limit_per_minute: parseInt(e.target.value) || 60 })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sandbox</Label>
                  <Select value={editingTool.sandbox_level || "standard"} onValueChange={(v) => setEditingTool({ ...editingTool, sandbox_level: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">Nenhum</SelectItem>
                      <SelectItem value="standard" className="text-xs">Standard</SelectItem>
                      <SelectItem value="strict" className="text-xs">Strict (Docker)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button className="w-full gap-1" onClick={handleSaveTool}>
                <Check className="h-4 w-4" />
                {isCreating ? "Criar Tool" : "Salvar Alterações"}
              </Button>

              {/* Tester */}
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Play className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs font-semibold">Tester Inline</span>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Input (JSON)</Label>
                  <Textarea
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    className="text-xs font-mono min-h-[60px]"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1 text-xs"
                  onClick={handleTestTool}
                  disabled={testLoading || !getEndpointFromConfig(editingTool.executor_config || {})}
                >
                  {testLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  Executar Teste
                </Button>
                {testOutput && (
                  <div className="space-y-1">
                    <Label className="text-xs">Output</Label>
                    <pre className="text-[10px] font-mono bg-muted p-2 rounded-md overflow-auto max-h-[200px] whitespace-pre-wrap">
                      {testOutput}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
