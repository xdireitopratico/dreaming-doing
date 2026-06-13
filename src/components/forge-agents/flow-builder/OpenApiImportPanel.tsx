/**
 * OpenApiImportPanel — Discover and import endpoints from OpenAPI/Swagger specs
 * Creates HTTP tool nodes from discovered API endpoints
 */
import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import {
  X, Search, Loader2, Lock, ChevronDown, ChevronRight,
  Plus, AlertCircle, FileJson, Server,
} from "lucide-react";

interface Endpoint {
  method: string;
  path: string;
  summary: string;
  operationId: string;
  parameters: Array<{ name: string; in: string; required: boolean; type: string }>;
  has_request_body: boolean;
  tags: string[];
}

interface DiscoveryResult {
  found: boolean;
  error?: string;
  tried_paths?: string[];
  spec_url?: string;
  spec_version?: string;
  api_title?: string;
  api_description?: string;
  api_version?: string;
  base_url?: string;
  security_schemes?: Record<string, { type: string; in?: string; name?: string; scheme?: string }>;
  endpoints_count?: number;
  endpoints?: Endpoint[];
}

interface OpenApiImportPanelProps {
  flowId: string;
  onClose: () => void;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  POST: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  PUT: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  PATCH: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  DELETE: "bg-red-500/15 text-red-600 border-red-500/30",
};

export function OpenApiImportPanel({ flowId, onClose }: OpenApiImportPanelProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  ;

  const handleDiscover = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setResult(null);
    setSelected(new Set());

    try {
      const { data, error } = await supabase.functions.invoke("prometheus-cortex", {
        body: {
          action: "tool_call",
          tool_name: "discover_api",
          params: { url: trimmed },
          session_id: flowId,
        },
      });

      if (error) throw error;
      setResult(data as DiscoveryResult);

      if (data?.found) {
        toast({ title: `${data.endpoints_count} endpoints encontrados` });
      } else {
        toast({ title: "Spec não encontrada", description: data?.error, variant: "destructive" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao descobrir API";
      setResult({ found: false, error: msg });
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }

    setLoading(false);
  }, [url, flowId, toast]);

  const toggleSelect = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const selectAll = () => {
    if (!result?.endpoints) return;
    if (selected.size === result.endpoints.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(result.endpoints.map((_, i) => i)));
    }
  };

  const handleImport = useCallback(async () => {
    if (!result?.endpoints || selected.size === 0) return;
    setImporting(true);

    const baseUrl = result.base_url || url.trim().replace(/\/+$/, "");
    let created = 0;

    for (const idx of selected) {
      const ep = result.endpoints[idx];
      const toolName = (ep.operationId || `${ep.method.toLowerCase()}_${ep.path}`)
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 60);

      const inputSchema: Record<string, unknown> = {};
      for (const p of ep.parameters) {
        inputSchema[p.name] = { type: p.type, required: p.required, in: p.in };
      }

      try {
        await supabase.from("tool_registry").insert({
          name: toolName,
          display_name: ep.summary || `${ep.method} ${ep.path}`,
          description: ep.summary || `${ep.method} ${ep.path}`,
          category: "http",
          executor_type: "http",
          executor_config: {
            url: `${baseUrl}${ep.path}`,
            method: ep.method,
            has_request_body: ep.has_request_body,
          },
          input_schema: inputSchema,
          output_schema: {},
          is_active: true,
          source: "openapi_import",
          tags: ep.tags || [],
        } as any);
        created++;
      } catch {
        // Skip duplicates silently
      }
    }

    toast({
      title: `${created} tool${created !== 1 ? "s" : ""} importada${created !== 1 ? "s" : ""}`,
      description: `De ${result.api_title || "API"} para o tool registry`,
    });
    setImporting(false);
  }, [result, selected, url, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleDiscover();
  };

  return (
    <div className="w-[420px] border-l bg-background flex flex-col shrink-0 max-h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Importar API (OpenAPI)</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* URL input */}
      <div className="p-3 border-b space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="https://api.example.com"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-xs flex-1"
          />
          <Button
            onClick={handleDiscover}
            disabled={loading || !url.trim()}
            size="sm"
            className="h-8 px-3 text-xs"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Cola a URL base da API. Procuramos automaticamente /openapi.json, /swagger.json, etc.
        </p>
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        {/* API info header */}
        {result?.found && (
          <div className="p-3 border-b bg-muted/30 space-y-1.5">
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold">{result.api_title}</span>
              {result.api_version && (
                <Badge variant="outline" className="text-[10px]">v{result.api_version}</Badge>
              )}
            </div>
            {result.api_description && (
              <p className="text-[10px] text-muted-foreground line-clamp-2">{result.api_description}</p>
            )}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>OpenAPI {result.spec_version}</span>
              <span>{result.endpoints_count} endpoints</span>
            </div>

            {/* Security schemes */}
            {result.security_schemes && Object.keys(result.security_schemes).length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <Lock className="h-3 w-3 text-amber-500" />
                {Object.entries(result.security_schemes).map(([name, s]) => (
                  <Badge key={name} variant="secondary" className="text-[9px]">
                    {name}: {s.type}{s.scheme ? ` (${s.scheme})` : ""}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Not found */}
        {result && !result.found && (
          <div className="p-6 text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-xs text-muted-foreground">{result.error}</p>
          </div>
        )}

        {/* Endpoint list */}
        {result?.found && result.endpoints && (
          <div className="p-2 space-y-1">
            {/* Select all */}
            <div className="flex items-center justify-between px-2 py-1.5">
              <button onClick={selectAll} className="text-[10px] text-primary hover:underline">
                {selected.size === result.endpoints.length ? "Desmarcar tudo" : "Selecionar tudo"}
              </button>
              <span className="text-[10px] text-muted-foreground">
                {selected.size} de {result.endpoints.length} selecionados
              </span>
            </div>

            {result.endpoints.map((ep, idx) => {
              const isExpanded = expandedIdx === idx;
              const isSelected = selected.has(idx);
              return (
                <div key={idx} className={`border rounded-lg overflow-hidden ${isSelected ? "border-primary/40 bg-primary/5" : ""}`}>
                  <div className="flex items-center gap-2 p-2 hover:bg-muted/50 transition-colors">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(idx)}
                      className="h-3.5 w-3.5"
                    />
                    <Badge variant="outline" className={`text-[9px] font-mono px-1.5 py-0 shrink-0 ${METHOD_COLORS[ep.method] || ""}`}>
                      {ep.method}
                    </Badge>
                    <button
                      onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                      className="flex-1 text-left min-w-0"
                    >
                      <span className="text-[11px] font-mono truncate block">{ep.path}</span>
                      {ep.summary && (
                        <span className="text-[9px] text-muted-foreground truncate block">{ep.summary}</span>
                      )}
                    </button>
                    <button onClick={() => setExpandedIdx(isExpanded ? null : idx)} className="shrink-0">
                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-2 pt-1 border-t bg-muted/20 space-y-1.5">
                      {ep.parameters.length > 0 && (
                        <div>
                          <span className="text-[9px] font-semibold text-muted-foreground uppercase">Parâmetros</span>
                          <div className="space-y-0.5 mt-0.5">
                            {ep.parameters.map((p, pi) => (
                              <div key={pi} className="flex items-center gap-1.5 text-[10px]">
                                <code className="text-primary font-mono">{p.name}</code>
                                <Badge variant="outline" className="text-[8px] px-1 py-0">{p.type}</Badge>
                                <span className="text-muted-foreground">({p.in})</span>
                                {p.required && <span className="text-destructive text-[8px]">*</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {ep.has_request_body && (
                        <span className="text-[9px] text-muted-foreground">Requer request body</span>
                      )}
                      {ep.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {ep.tags.map((t, ti) => (
                            <Badge key={ti} variant="secondary" className="text-[8px]">{String(t)}</Badge>
                          ))}
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

      {/* Import action */}
      {result?.found && (
        <div className="p-3 border-t flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {selected.size} endpoint{selected.size !== 1 ? "s" : ""} → tool registry
          </span>
          <Button
            onClick={handleImport}
            disabled={importing || selected.size === 0}
            size="sm"
            className="h-8 px-4 text-xs"
          >
            {importing ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Importando...</>
            ) : (
              <><Plus className="h-3.5 w-3.5 mr-1.5" /> Importar Selecionados</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
