/**
 * ExportImportPanel — Export/Import completo de agentes como .zip
 * Rodada 29: Agent Import/Export + Backup
 */
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import JSZip from "jszip";
import {
  X,
  Download,
  Upload,
  FileArchive,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileJson,
  Database,
  Wrench,
  KeyRound,
  Info,
} from "lucide-react";
import type { Node, Edge } from "@xyflow/react";

interface ExportImportPanelProps {
  flowId: string;
  flowName: string;
  currentNodes: Node[];
  currentEdges: Edge[];
  onImport: (nodes: Node[], edges: Edge[]) => void;
  onClose: () => void;
}

interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  summary: { nodes: number; edges: number; tools: number; ragDocs: number; secrets: number };
}

export function ExportImportPanel({
  flowId, flowName, currentNodes, currentEdges, onImport, onClose,
}: ExportImportPanelProps) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  ;

  // ─── EXPORT ───
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const zip = new JSZip();

      // 1. Flow definition
      const flowDef = {
        version: "1.0",
        exported_at: new Date().toISOString(),
        flow_name: flowName,
        flow_id: flowId,
        nodes: currentNodes,
        edges: currentEdges,
      };
      zip.file("flow.json", JSON.stringify(flowDef, null, 2));

      // 2. Tools from registry
      const { data: tools } = await (supabase as any)
        .from("tool_registry")
        .select("*")
        .eq("tenant_id", flowId);
      if (tools && tools.length > 0) {
        zip.file("tools.json", JSON.stringify(tools, null, 2));
      }

      // 3. RAG documents metadata (not embeddings)
      const { data: ragDocs } = await (supabase as any)
        .from("rag_documents")
        .select("id, title, source_type, source_url, metadata, chunking_strategy, chunk_size, chunk_overlap, status")
        .eq("tenant_id", flowId);
      if (ragDocs && ragDocs.length > 0) {
        zip.file("rag_documents.json", JSON.stringify(ragDocs, null, 2));
      }

      // 4. Secrets references (names only, NOT values)
      const { data: secrets } = await (supabase as any)
        .from("tenant_secrets")
        .select("secret_name, description, created_at")
        .eq("tenant_id", flowId);
      if (secrets && secrets.length > 0) {
        zip.file("secrets_refs.json", JSON.stringify(secrets, null, 2));
      }

      // 5. Schedules
      const { data: schedules } = await supabase
        .from("agent_schedules")
        .select("name, cron_expression, timezone, is_active, input_payload")
        .eq("flow_id", flowId);
      if (schedules && schedules.length > 0) {
        zip.file("schedules.json", JSON.stringify(schedules, null, 2));
      }

      // 6. Alert rules
      const { data: alertRules } = await supabase
        .from("agent_alert_rules")
        .select("rule_type, condition, is_active")
        .eq("flow_id", flowId);
      if (alertRules && alertRules.length > 0) {
        zip.file("alert_rules.json", JSON.stringify(alertRules, null, 2));
      }

      // 7. Manifest
      const manifest = {
        format_version: "1.0",
        exported_at: new Date().toISOString(),
        agent_name: flowName,
        contents: {
          flow: true,
          tools: (tools?.length || 0) > 0,
          rag_documents: (ragDocs?.length || 0) > 0,
          secrets_refs: (secrets?.length || 0) > 0,
          schedules: (schedules?.length || 0) > 0,
          alert_rules: (alertRules?.length || 0) > 0,
        },
        stats: {
          nodes: currentNodes.length,
          edges: currentEdges.length,
          tools: tools?.length || 0,
          rag_documents: ragDocs?.length || 0,
          secrets: secrets?.length || 0,
          schedules: schedules?.length || 0,
        },
      };
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      // Generate and download
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${flowName.replace(/[^a-zA-Z0-9]/g, "_")}_backup_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "Backup exportado com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao exportar", description: err.message, variant: "destructive" });
    }
    setExporting(false);
  }, [flowId, flowName, currentNodes, currentEdges, toast]);

  // ─── IMPORT: File selection + validation ───
  const handleFileSelect = useCallback(async (file: File) => {
    setImportFile(file);
    setValidation(null);
    setImportPreview(null);

    try {
      const zip = await JSZip.loadAsync(file);
      const warnings: string[] = [];
      const errors: string[] = [];

      // Check manifest
      const manifestFile = zip.file("manifest.json");
      if (!manifestFile) {
        errors.push("Arquivo manifest.json não encontrado no backup");
      }

      // Check flow.json
      const flowFile = zip.file("flow.json");
      if (!flowFile) {
        errors.push("Arquivo flow.json não encontrado — backup inválido");
      }

      let flowData: any = null;
      let toolsData: any[] = [];
      let ragData: any[] = [];
      let secretsData: any[] = [];

      if (flowFile) {
        const content = await flowFile.async("text");
        flowData = JSON.parse(content);
        if (!flowData.nodes || !Array.isArray(flowData.nodes)) {
          errors.push("flow.json não contém array de nós válido");
        }
        if (!flowData.edges || !Array.isArray(flowData.edges)) {
          errors.push("flow.json não contém array de edges válido");
        }
      }

      // Tools
      const toolsFile = zip.file("tools.json");
      if (toolsFile) {
        toolsData = JSON.parse(await toolsFile.async("text"));
        warnings.push(`${toolsData.length} tool(s) serão importadas`);
      }

      // RAG docs
      const ragFile = zip.file("rag_documents.json");
      if (ragFile) {
        ragData = JSON.parse(await ragFile.async("text"));
        warnings.push(`${ragData.length} documento(s) RAG (metadados apenas, sem embeddings)`);
      }

      // Secrets refs
      const secretsFile = zip.file("secrets_refs.json");
      if (secretsFile) {
        secretsData = JSON.parse(await secretsFile.async("text"));
        warnings.push(`${secretsData.length} secret(s) referenciados — valores precisam ser reconfigurados`);
      }

      const result: ValidationResult = {
        valid: errors.length === 0,
        warnings,
        errors,
        summary: {
          nodes: flowData?.nodes?.length || 0,
          edges: flowData?.edges?.length || 0,
          tools: toolsData.length,
          ragDocs: ragData.length,
          secrets: secretsData.length,
        },
      };

      setValidation(result);
      setImportPreview({ flowData, toolsData, ragData, secretsData, zip });
    } catch (err: any) {
      setValidation({
        valid: false,
        warnings: [],
        errors: [`Erro ao ler arquivo: ${err.message}`],
        summary: { nodes: 0, edges: 0, tools: 0, ragDocs: 0, secrets: 0 },
      });
    }
  }, []);

  // ─── IMPORT: Apply ───
  const handleImport = useCallback(async () => {
    if (!importPreview || !validation?.valid) return;
    setImporting(true);

    try {
      const { flowData, toolsData, ragData, secretsData } = importPreview;

      // 1. Apply flow (regenerate IDs)
      const idMap: Record<string, string> = {};
      const newNodes: Node[] = flowData.nodes.map((n: Node) => {
        const newId = `${n.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        idMap[n.id] = newId;
        return { ...n, id: newId };
      });
      const newEdges: Edge[] = flowData.edges.map((e: Edge) => ({
        ...e,
        id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        source: idMap[e.source] || e.source,
        target: idMap[e.target] || e.target,
      }));

      onImport(newNodes, newEdges);

      // 2. Import tools
      if (toolsData.length > 0) {
        for (const tool of toolsData) {
          const { id, created_at, updated_at, ...toolData } = tool;
          await supabase.from("tool_registry").upsert({
            ...toolData,
            tenant_id: flowId,
          }, { onConflict: "tenant_id,name" });
        }
      }

      // 3. Import RAG doc metadata
      if (ragData.length > 0) {
        for (const doc of ragData) {
          const { id, ...docData } = doc;
          await supabase.from("rag_documents").insert({
            ...docData,
            tenant_id: flowId,
            status: "pending",
          });
        }
      }

      // 4. Create placeholder secrets
      if (secretsData.length > 0) {
        for (const secret of secretsData) {
          const { data: existing } = await supabase
            .from("tenant_secrets")
            .select("id")
            .eq("tenant_id", flowId)
            .eq("secret_name", secret.secret_name)
            .maybeSingle();

          if (!existing) {
            await supabase.from("tenant_secrets").insert({
              tenant_id: flowId,
              secret_name: secret.secret_name,
              description: secret.description || "Importado — configurar valor",
              encrypted_value: "",
            });
          }
        }
      }

      // 5. Import schedules
      const schedulesFile = importPreview.zip.file("schedules.json");
      if (schedulesFile) {
        const schedules = JSON.parse(await schedulesFile.async("text"));
        for (const sched of schedules) {
          await supabase.from("agent_schedules").insert({
            ...sched,
            flow_id: flowId,
            run_count: 0,
          });
        }
      }

      toast({ title: "Backup importado com sucesso!" });
      setImportFile(null);
      setValidation(null);
      setImportPreview(null);
    } catch (err: any) {
      toast({ title: "Erro ao importar", description: err.message, variant: "destructive" });
    }
    setImporting(false);
  }, [importPreview, validation, flowId, onImport, toast]);

  return (
    <div className="w-[400px] border-l bg-background flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileArchive className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Export / Import</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="export" className="flex-1 flex flex-col">
        <TabsList className="mx-3 mt-2 grid grid-cols-2">
          <TabsTrigger value="export" className="text-xs">
            <Download className="h-3 w-3 mr-1" />
            Exportar
          </TabsTrigger>
          <TabsTrigger value="import" className="text-xs">
            <Upload className="h-3 w-3 mr-1" />
            Importar
          </TabsTrigger>
        </TabsList>

        {/* ─── EXPORT TAB ─── */}
        <TabsContent value="export" className="flex-1 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h4 className="text-sm font-medium">Backup completo</h4>
                <p className="text-xs text-muted-foreground">
                  Exporta o agente com todos os dados associados em um arquivo .zip.
                </p>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <FileJson className="h-3.5 w-3.5 text-primary" />
                    <span>Flow definition ({currentNodes.length} nós, {currentEdges.length} conexões)</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Wrench className="h-3.5 w-3.5 text-primary" />
                    <span>Tools do registry</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Database className="h-3.5 w-3.5 text-primary" />
                    <span>Documentos RAG (metadados)</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <KeyRound className="h-3.5 w-3.5 text-primary" />
                    <span>Referências de secrets (sem valores)</span>
                  </div>
                </div>

                <div className="rounded-md bg-muted/50 p-2 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-[10px] text-muted-foreground">
                    Valores de secrets e embeddings não são exportados por segurança. Ao importar, será necessário reconfigurar secrets e reindexar documentos RAG.
                  </p>
                </div>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {exporting ? "Exportando..." : "Exportar Backup .zip"}
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ─── IMPORT TAB ─── */}
        <TabsContent value="import" className="flex-1 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* File input */}
              <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center">
                <FileArchive className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-xs text-muted-foreground mb-3">
                  Selecione um arquivo .zip de backup
                </p>
                <label>
                  <input
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelect(f);
                    }}
                  />
                  <Button variant="outline" size="sm" className="gap-1" asChild>
                    <span>
                      <Upload className="h-3.5 w-3.5" />
                      Escolher arquivo
                    </span>
                  </Button>
                </label>
                {importFile && (
                  <p className="text-xs text-muted-foreground mt-2">
                    📦 {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {/* Validation results */}
              {validation && (
                <div className="space-y-3">
                  {/* Status */}
                  <div className={`rounded-lg border p-3 flex items-center gap-2 ${
                    validation.valid ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"
                  }`}>
                    {validation.valid ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="text-sm font-medium">
                      {validation.valid ? "Backup válido" : "Backup inválido"}
                    </span>
                  </div>

                  {/* Summary */}
                  <div className="rounded-lg border bg-card p-3 space-y-2">
                    <h4 className="text-xs font-semibold">Conteúdo</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[9px]">{validation.summary.nodes}</Badge>
                        <span>Nós</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[9px]">{validation.summary.edges}</Badge>
                        <span>Conexões</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[9px]">{validation.summary.tools}</Badge>
                        <span>Tools</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[9px]">{validation.summary.ragDocs}</Badge>
                        <span>RAG Docs</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[9px]">{validation.summary.secrets}</Badge>
                        <span>Secrets</span>
                      </div>
                    </div>
                  </div>

                  {/* Errors */}
                  {validation.errors.length > 0 && (
                    <div className="space-y-1">
                      {validation.errors.map((err, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-destructive">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{err}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Warnings */}
                  {validation.warnings.length > 0 && (
                    <div className="space-y-1">
                      {validation.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-amber-600">
                          <Info className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Import button */}
                  {validation.valid && (
                    <Button
                      className="w-full gap-2"
                      onClick={handleImport}
                      disabled={importing}
                    >
                      {importing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {importing ? "Importando..." : "Aplicar Backup"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
