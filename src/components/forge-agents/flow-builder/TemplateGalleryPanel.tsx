/**
 * TemplateGalleryPanel — Galeria de templates pré-configurados de agentes
 * Permite preview, importação e uso rápido de padrões de flows
 */
import { useState } from "react";
import { X, Eye, Download, Upload, FileJson, Bot, MessageSquare, Search, ShieldCheck, Headphones, Scale, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import type { Node, Edge } from "@xyflow/react";

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  tags: string[];
  nodeCount: number;
  nodes: Node[];
  edges: Edge[];
}

const TEMPLATES: Template[] = [
  {
    id: "atendimento-basico",
    name: "Atendimento Básico",
    description: "Agente simples de atendimento com saudação, coleta de info e encaminhamento.",
    category: "atendimento",
    icon: <MessageSquare className="h-5 w-5" />,
    tags: ["chat", "suporte", "básico"],
    nodeCount: 4,
    nodes: [
      { id: "trigger_1", type: "trigger", position: { x: 100, y: 200 }, data: { label: "TRIGGER", config: { trigger_type: "message" } } },
      { id: "llm_1", type: "llm", position: { x: 350, y: 150 }, data: { label: "LLM", config: { model: "gemini-2.5-flash", temperature: 0.7, system_prompt: "Você é um assistente de atendimento cordial. Cumprimente o usuário e pergunte como pode ajudar." } } },
      { id: "condition_1", type: "condition", position: { x: 600, y: 200 }, data: { label: "CONDITION", config: { expression: "output.intent === 'encaminhar'" } } },
      { id: "llm_2", type: "llm", position: { x: 850, y: 100 }, data: { label: "LLM", config: { model: "gemini-2.5-flash", temperature: 0.5, system_prompt: "Forneça a resposta final e pergunte se precisa de mais alguma coisa." } } },
    ],
    edges: [
      { id: "e1", source: "trigger_1", target: "llm_1", animated: true },
      { id: "e2", source: "llm_1", target: "condition_1", animated: true },
      { id: "e3", source: "condition_1", target: "llm_2", sourceHandle: "true", animated: true },
    ],
  },
  {
    id: "rag-consulta",
    name: "Consulta com RAG",
    description: "Agente que busca informações em documentos antes de responder, ideal para FAQs e base de conhecimento.",
    category: "rag",
    icon: <Search className="h-5 w-5" />,
    tags: ["rag", "documentos", "busca", "FAQ"],
    nodeCount: 5,
    nodes: [
      { id: "trigger_1", type: "trigger", position: { x: 100, y: 200 }, data: { label: "TRIGGER", config: { trigger_type: "message" } } },
      { id: "rag_1", type: "rag_search", position: { x: 350, y: 200 }, data: { label: "RAG SEARCH", config: { top_k: 5, threshold: 0.7 } } },
      { id: "llm_1", type: "llm", position: { x: 600, y: 200 }, data: { label: "LLM", config: { model: "gemini-2.5-pro", temperature: 0.3, system_prompt: "Responda com base EXCLUSIVAMENTE nos documentos fornecidos. Se não encontrar a resposta, diga que não tem essa informação." } } },
      { id: "guard_1", type: "output_guard", position: { x: 850, y: 200 }, data: { label: "OUTPUT GUARD", config: { rules: ["no_pii", "no_hallucination"] } } },
    ],
    edges: [
      { id: "e1", source: "trigger_1", target: "rag_1", animated: true },
      { id: "e2", source: "rag_1", target: "llm_1", animated: true },
      { id: "e3", source: "llm_1", target: "guard_1", animated: true },
    ],
  },
  {
    id: "triagem-juridica",
    name: "Triagem Jurídica",
    description: "Agente especializado em triagem de demandas jurídicas com classificação e encaminhamento por área.",
    category: "juridico",
    icon: <Scale className="h-5 w-5" />,
    tags: ["jurídico", "triagem", "classificação"],
    nodeCount: 7,
    nodes: [
      { id: "trigger_1", type: "trigger", position: { x: 100, y: 250 }, data: { label: "TRIGGER", config: { trigger_type: "message" } } },
      { id: "llm_1", type: "llm", position: { x: 350, y: 250 }, data: { label: "LLM", config: { model: "gemini-2.5-pro", temperature: 0.2, system_prompt: "Você é um assistente de triagem jurídica. Colete: tipo de problema, urgência, partes envolvidas. Classifique a área: trabalhista, consumidor, família, cível, criminal." } } },
      { id: "switch_1", type: "switch", position: { x: 600, y: 250 }, data: { label: "SWITCH", config: { expression: "output.area", cases: ["trabalhista", "consumidor", "família", "cível"] } } },
      { id: "llm_trab", type: "llm", position: { x: 900, y: 50 }, data: { label: "LLM", config: { model: "gemini-2.5-flash", system_prompt: "Especialista em direito trabalhista. Forneça orientação inicial." } } },
      { id: "llm_cons", type: "llm", position: { x: 900, y: 200 }, data: { label: "LLM", config: { model: "gemini-2.5-flash", system_prompt: "Especialista em direito do consumidor. Forneça orientação inicial." } } },
      { id: "llm_fam", type: "llm", position: { x: 900, y: 350 }, data: { label: "LLM", config: { model: "gemini-2.5-flash", system_prompt: "Especialista em direito de família. Forneça orientação inicial." } } },
      { id: "guard_1", type: "output_guard", position: { x: 1150, y: 200 }, data: { label: "OUTPUT GUARD", config: { rules: ["no_legal_advice", "disclaimer"] } } },
    ],
    edges: [
      { id: "e1", source: "trigger_1", target: "llm_1", animated: true },
      { id: "e2", source: "llm_1", target: "switch_1", animated: true },
      { id: "e3", source: "switch_1", target: "llm_trab", sourceHandle: "case_0", animated: true },
      { id: "e4", source: "switch_1", target: "llm_cons", sourceHandle: "case_1", animated: true },
      { id: "e5", source: "switch_1", target: "llm_fam", sourceHandle: "case_2", animated: true },
      { id: "e6", source: "llm_trab", target: "guard_1", animated: true },
      { id: "e7", source: "llm_cons", target: "guard_1", animated: true },
      { id: "e8", source: "llm_fam", target: "guard_1", animated: true },
    ],
  },
  {
    id: "suporte-voz",
    name: "Suporte por Voz",
    description: "Agente de voz com STT, processamento LLM e TTS para atendimento telefônico.",
    category: "voz",
    icon: <Headphones className="h-5 w-5" />,
    tags: ["voz", "stt", "tts", "telefone"],
    nodeCount: 5,
    nodes: [
      { id: "trigger_1", type: "trigger", position: { x: 100, y: 200 }, data: { label: "TRIGGER", config: { trigger_type: "voice" } } },
      { id: "stt_1", type: "stt", position: { x: 350, y: 200 }, data: { label: "STT", config: { language: "pt-BR" } } },
      { id: "llm_1", type: "llm", position: { x: 600, y: 200 }, data: { label: "LLM", config: { model: "gemini-2.5-flash", temperature: 0.6, system_prompt: "Você é um assistente de suporte por voz. Seja conciso e claro nas respostas." } } },
      { id: "tts_1", type: "tts", position: { x: 850, y: 200 }, data: { label: "TTS", config: { voice: "pt-BR-female", speed: 1.0 } } },
      { id: "guard_1", type: "output_guard", position: { x: 1100, y: 200 }, data: { label: "OUTPUT GUARD", config: { rules: ["no_pii"] } } },
    ],
    edges: [
      { id: "e1", source: "trigger_1", target: "stt_1", animated: true },
      { id: "e2", source: "stt_1", target: "llm_1", animated: true },
      { id: "e3", source: "llm_1", target: "tts_1", animated: true },
      { id: "e4", source: "tts_1", target: "guard_1", animated: true },
    ],
  },
  {
    id: "aprovacao-hitl",
    name: "Fluxo com Aprovação",
    description: "Agente que processa solicitações e pausa para aprovação humana antes de executar ações críticas.",
    category: "aprovacao",
    icon: <ShieldCheck className="h-5 w-5" />,
    tags: ["hitl", "aprovação", "humano", "segurança"],
    nodeCount: 6,
    nodes: [
      { id: "trigger_1", type: "trigger", position: { x: 100, y: 200 }, data: { label: "TRIGGER", config: { trigger_type: "message" } } },
      { id: "llm_1", type: "llm", position: { x: 350, y: 200 }, data: { label: "LLM", config: { model: "gemini-2.5-flash", temperature: 0.3, system_prompt: "Analise a solicitação e prepare um resumo para aprovação humana." } } },
      { id: "hitl_1", type: "hitl", position: { x: 600, y: 200 }, data: { label: "HITL", config: { timeout_minutes: 60, message: "Aprovar execução desta ação?" } } },
      { id: "tool_1", type: "tool", position: { x: 850, y: 100 }, data: { label: "TOOL", config: { tool_name: "executar_acao" } } },
      { id: "llm_reject", type: "llm", position: { x: 850, y: 300 }, data: { label: "LLM", config: { model: "gemini-2.5-flash", system_prompt: "Informe ao usuário que a solicitação foi rejeitada e os motivos." } } },
      { id: "error_1", type: "error_handler", position: { x: 1100, y: 200 }, data: { label: "ERROR HANDLER", config: { retry_count: 1 } } },
    ],
    edges: [
      { id: "e1", source: "trigger_1", target: "llm_1", animated: true },
      { id: "e2", source: "llm_1", target: "hitl_1", animated: true },
      { id: "e3", source: "hitl_1", target: "tool_1", sourceHandle: "approved", animated: true },
      { id: "e4", source: "hitl_1", target: "llm_reject", sourceHandle: "rejected", animated: true },
      { id: "e5", source: "tool_1", target: "error_1", animated: true },
    ],
  },
  {
    id: "agente-multimodal",
    name: "Agente Multimodal",
    description: "Template avançado com RAG, memória, ferramentas e guardrails para casos complexos.",
    category: "avancado",
    icon: <Layers className="h-5 w-5" />,
    tags: ["avançado", "multimodal", "rag", "memória", "tools"],
    nodeCount: 8,
    nodes: [
      { id: "trigger_1", type: "trigger", position: { x: 100, y: 250 }, data: { label: "TRIGGER", config: { trigger_type: "message" } } },
      { id: "memory_r", type: "memory", position: { x: 350, y: 100 }, data: { label: "MEMORY", config: { operation: "read", scope: "session" } } },
      { id: "rag_1", type: "rag_search", position: { x: 350, y: 350 }, data: { label: "RAG SEARCH", config: { top_k: 5, threshold: 0.7 } } },
      { id: "transformer_1", type: "transformer", position: { x: 600, y: 250 }, data: { label: "TRANSFORMER", config: { template: "Contexto da memória: {{memory}}\nDocumentos: {{rag_results}}\nPergunta: {{user_message}}" } } },
      { id: "llm_1", type: "llm", position: { x: 850, y: 250 }, data: { label: "LLM", config: { model: "gemini-2.5-pro", temperature: 0.4, system_prompt: "Use o contexto fornecido para responder. Cite fontes quando possível." } } },
      { id: "guard_1", type: "output_guard", position: { x: 1100, y: 200 }, data: { label: "OUTPUT GUARD", config: { rules: ["no_pii", "no_hallucination", "factual_only"] } } },
      { id: "memory_w", type: "memory", position: { x: 1100, y: 350 }, data: { label: "MEMORY", config: { operation: "write", scope: "session" } } },
    ],
    edges: [
      { id: "e1", source: "trigger_1", target: "memory_r", animated: true },
      { id: "e2", source: "trigger_1", target: "rag_1", animated: true },
      { id: "e3", source: "memory_r", target: "transformer_1", animated: true },
      { id: "e4", source: "rag_1", target: "transformer_1", animated: true },
      { id: "e5", source: "transformer_1", target: "llm_1", animated: true },
      { id: "e6", source: "llm_1", target: "guard_1", animated: true },
      { id: "e7", source: "llm_1", target: "memory_w", animated: true },
    ],
  },
];

const CATEGORIES = [
  { id: "all", label: "Todos" },
  { id: "atendimento", label: "Atendimento" },
  { id: "rag", label: "RAG" },
  { id: "juridico", label: "Jurídico" },
  { id: "voz", label: "Voz" },
  { id: "aprovacao", label: "Aprovação" },
  { id: "avancado", label: "Avançado" },
];

interface TemplateGalleryPanelProps {
  flowId: string;
  onApplyTemplate: (nodes: Node[], edges: Edge[]) => void;
  onClose: () => void;
}

export function TemplateGalleryPanel({ flowId, onApplyTemplate, onClose }: TemplateGalleryPanelProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [activeTab, setActiveTab] = useState("gallery");
  const [importJson, setImportJson] = useState("");
  ;

  const filtered = TEMPLATES.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some((tag) => tag.includes(search.toLowerCase()));
    const matchCategory = category === "all" || t.category === category;
    return matchSearch && matchCategory;
  });

  const handleUseTemplate = (template: Template) => {
    // Regenerate IDs to avoid collisions
    const ts = Date.now();
    const idMap: Record<string, string> = {};
    const newNodes = template.nodes.map((n, i) => {
      const newId = `${n.type}_${ts}_${i}`;
      idMap[n.id] = newId;
      return { ...n, id: newId };
    });
    const newEdges = template.edges.map((e, i) => ({
      ...e,
      id: `e_${ts}_${i}`,
      source: idMap[e.source] || e.source,
      target: idMap[e.target] || e.target,
    }));
    onApplyTemplate(newNodes, newEdges);
    toast({ title: `Template "${template.name}" aplicado!` });
    onClose();
  };

  const handleExport = async () => {
    const { data } = await supabase
      .from("agent_flows")
      .select("name, flow_definition")
      .eq("id", flowId)
      .single();

    if (!data) {
      toast({ title: "Erro ao exportar", variant: "destructive" });
      return;
    }

    const exportData = {
      name: (data as any).name,
      flow_definition: (data as any).flow_definition,
      exported_at: new Date().toISOString(),
      version: "1.0",
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(data as any).name.replace(/\s+/g, "-").toLowerCase()}-flow.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Flow exportado!" });
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importJson);
      if (!parsed.flow_definition?.nodes || !parsed.flow_definition?.edges) {
        toast({ title: "JSON inválido — faltam nodes/edges", variant: "destructive" });
        return;
      }
      onApplyTemplate(parsed.flow_definition.nodes, parsed.flow_definition.edges);
      toast({ title: `Flow "${parsed.name || "importado"}" aplicado!` });
      setImportJson("");
      onClose();
    } catch {
      toast({ title: "JSON inválido", variant: "destructive" });
    }
  };

  const handleFileImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target?.result as string);
          if (!parsed.flow_definition?.nodes) {
            toast({ title: "JSON inválido", variant: "destructive" });
            return;
          }
          onApplyTemplate(parsed.flow_definition.nodes, parsed.flow_definition.edges || []);
          toast({ title: `Flow "${parsed.name || "importado"}" aplicado!` });
          onClose();
        } catch {
          toast({ title: "Erro ao ler arquivo", variant: "destructive" });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="w-96 border-l bg-background flex flex-col shrink-0 max-h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          Templates & Import/Export
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-2 grid grid-cols-3">
          <TabsTrigger value="gallery" className="text-xs">Galeria</TabsTrigger>
          <TabsTrigger value="import" className="text-xs">Importar</TabsTrigger>
          <TabsTrigger value="export" className="text-xs">Exportar</TabsTrigger>
        </TabsList>

        {/* Gallery Tab */}
        <TabsContent value="gallery" className="flex-1 flex flex-col min-h-0 m-0">
          <div className="px-3 pt-2 space-y-2">
            <Input
              placeholder="Buscar templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.map((c) => (
                <Badge
                  key={c.id}
                  variant={category === c.id ? "default" : "outline"}
                  className="cursor-pointer text-[10px] px-1.5 py-0.5"
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                </Badge>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1 px-3 pb-3">
            {previewTemplate ? (
              /* Preview Mode */
              <div className="mt-2 space-y-3">
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPreviewTemplate(null)}>
                  ← Voltar à galeria
                </Button>
                <div className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-md bg-primary/10 text-primary">
                      {previewTemplate.icon}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">{previewTemplate.name}</h4>
                      <p className="text-[10px] text-muted-foreground">{previewTemplate.nodeCount} nós</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{previewTemplate.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {previewTemplate.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>

                  {/* Node list preview */}
                  <div className="space-y-1">
                    <h5 className="text-xs font-semibold text-muted-foreground">Nós do template:</h5>
                    {previewTemplate.nodes.map((n) => (
                      <div key={n.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                        <Badge variant="outline" className="text-[9px] px-1">{(n.type || "").toUpperCase()}</Badge>
                        <span className="truncate text-muted-foreground">
                          {(n.data as any)?.config?.system_prompt
                            ? (n.data as any).config.system_prompt.slice(0, 50) + "..."
                            : (n.data as any)?.config?.model || n.type}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Edges preview */}
                  <div className="text-xs text-muted-foreground">
                    {previewTemplate.edges.length} conexões
                  </div>

                  <Button size="sm" className="w-full gap-1" onClick={() => handleUseTemplate(previewTemplate)}>
                    <Download className="h-3 w-3" />
                    Usar Template
                  </Button>
                </div>
              </div>
            ) : (
              /* Gallery grid */
              <div className="mt-2 space-y-2">
                {filtered.length === 0 && (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    Nenhum template encontrado
                  </div>
                )}
                {filtered.map((t) => (
                  <div
                    key={t.id}
                    className="border rounded-lg p-3 hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => setPreviewTemplate(t)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="p-1.5 rounded bg-primary/10 text-primary shrink-0">
                        {t.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium truncate">{t.name}</h4>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => { e.stopPropagation(); setPreviewTemplate(t); }}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => { e.stopPropagation(); handleUseTemplate(t); }}
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{t.description}</p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <Badge variant="secondary" className="text-[9px] px-1">{t.nodeCount} nós</Badge>
                          {t.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[9px] px-1">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Import Tab */}
        <TabsContent value="import" className="flex-1 flex flex-col gap-3 p-3 m-0">
          <p className="text-xs text-muted-foreground">
            Importe um flow a partir de um arquivo JSON ou cole o conteúdo abaixo.
          </p>
          <Button variant="outline" size="sm" className="gap-1" onClick={handleFileImport}>
            <FileJson className="h-4 w-4" />
            Selecionar arquivo .json
          </Button>
          <div className="text-xs text-center text-muted-foreground">ou cole o JSON:</div>
          <textarea
            className="flex-1 min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder='{"name": "...", "flow_definition": {"nodes": [...], "edges": [...]}}'
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
          />
          <Button size="sm" className="gap-1" onClick={handleImport} disabled={!importJson.trim()}>
            <Upload className="h-4 w-4" />
            Importar Flow
          </Button>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="flex-1 flex flex-col gap-3 p-3 m-0">
          <p className="text-xs text-muted-foreground">
            Exporte o flow atual como arquivo JSON para compartilhar ou fazer backup.
          </p>
          <Button size="sm" className="gap-1" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Exportar Flow como JSON
          </Button>
          <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
            <h4 className="text-xs font-semibold">O que é exportado:</h4>
            <ul className="text-[10px] text-muted-foreground space-y-1 list-disc list-inside">
              <li>Todos os nós e conexões</li>
              <li>Configurações de cada nó (modelo, prompt, etc.)</li>
              <li>Posições no canvas</li>
              <li>Nome e metadados do flow</li>
            </ul>
            <h4 className="text-xs font-semibold mt-2">O que NÃO é exportado:</h4>
            <ul className="text-[10px] text-muted-foreground space-y-1 list-disc list-inside">
              <li>Segredos e chaves API</li>
              <li>Histórico de execuções</li>
              <li>Documentos RAG</li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
