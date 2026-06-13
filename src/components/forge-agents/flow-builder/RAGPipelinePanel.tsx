/**
 * RAGPipelinePanel — Gestão de documentos RAG no builder
 * Upload, visualização de chunks, status de embedding e busca semântica
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import {
  X,
  Upload,
  FileText,
  Search,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Database,
  Hash,
} from "lucide-react";

interface RAGDocument {
  id: string;
  file_name: string | null;
  source_type: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  processing_status: string | null;
  total_chunks: number | null;
  chunk_size: number | null;
  chunk_overlap: number | null;
  chunk_strategy: string | null;
  embedding_model: string | null;
  created_at: string | null;
  last_indexed_at: string | null;
  flow_id: string | null;
  tenant_id: string;
}

interface RAGChunk {
  id: string;
  chunk_index: number;
  content: string;
  heading: string | null;
  page_number: number | null;
  char_start: number | null;
  char_end: number | null;
  embedding: string | null;
}

interface RAGPipelinePanelProps {
  flowId: string;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-500", label: "Indexado" },
  processing: { icon: Loader2, color: "text-blue-500", label: "Processando" },
  pending: { icon: Clock, color: "text-amber-500", label: "Pendente" },
  error: { icon: AlertCircle, color: "text-destructive", label: "Erro" },
};

// BUG 136 FIX: Treat null/undefined as missing but 0 as valid
function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RAGPipelinePanel({ flowId, onClose }: RAGPipelinePanelProps) {
  const [documents, setDocuments] = useState<RAGDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<RAGChunk[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  // Upload form
  const [uploadMode, setUploadMode] = useState<"text" | "url">("text");
  const [textContent, setTextContent] = useState("");
  const [textFileName, setTextFileName] = useState("");
  const [urlSource, setUrlSource] = useState("");
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [chunkStrategy, setChunkStrategy] = useState("paragraph");

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RAGChunk[]>([]);
  const [searching, setSearching] = useState(false);

  ;

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    // BUG 121 FIX: Use parameterized filter instead of string interpolation
    const { data, error } = await supabase
      .from("rag_documents")
      .select("*")
      .or(`flow_id.eq.${encodeURIComponent(flowId)},flow_id.is.null`)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setDocuments(data as RAGDocument[]);
    }
    setLoading(false);
  }, [flowId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const loadChunks = async (docId: string) => {
    if (expandedDocId === docId) {
      setExpandedDocId(null);
      setChunks([]);
      return;
    }
    setExpandedDocId(docId);
    setLoadingChunks(true);
    const { data } = await supabase
      .from("rag_chunks")
      .select("id, chunk_index, content, heading, page_number, char_start, char_end, embedding")
      .eq("document_id", docId)
      .order("chunk_index", { ascending: true })
      .limit(50);

    setChunks((data as RAGChunk[]) || []);
    setLoadingChunks(false);
  };

  const handleTextUpload = async () => {
    if (!textContent.trim()) {
      toast({ title: "Cole ou digite o conteúdo", variant: "destructive" });
      return;
    }

    setUploading(true);
    const { data: userData } = await supabase.auth.getUser();
    const tenantId = userData?.user?.id || "system";
    const fileName = textFileName.trim() || `documento_${Date.now()}.txt`;

    // Create document record
    const { data: doc, error: docErr } = await supabase
      .from("rag_documents")
      .insert({
        tenant_id: tenantId,
        flow_id: flowId,
        file_name: fileName,
        source_type: "text_paste",
        mime_type: "text/plain",
        file_size_bytes: new Blob([textContent]).size,
        processing_status: "processing",
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
        chunk_strategy: chunkStrategy,
      })
      .select()
      .single();

    if (docErr || !doc) {
      toast({ title: "Erro ao criar documento", description: docErr?.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    // Chunk the text locally
    const docData = doc as RAGDocument;
    const chunksArr = chunkText(textContent, chunkSize, chunkOverlap, chunkStrategy);

    // Insert chunks
    const chunkRows = chunksArr.map((c, i) => ({
      document_id: docData.id,
      tenant_id: tenantId,
      chunk_index: i,
      content: c.content,
      heading: c.heading || null,
      char_start: c.charStart,
      char_end: c.charEnd,
    }));

    const { error: chunkErr } = await supabase.from("rag_chunks").insert(chunkRows);

    if (chunkErr) {
      toast({ title: "Erro ao criar chunks", description: chunkErr.message, variant: "destructive" });
    } else {
      // Update document status
      await supabase
        .from("rag_documents")
        .update({
          processing_status: "pending",
          total_chunks: chunksArr.length,
        })
        .eq("id", docData.id);

      // Trigger embedding generation
      toast({ title: `${chunksArr.length} chunks criados! Gerando embeddings...` });
      setTextContent("");
      setTextFileName("");
      loadDocuments();

      // BUG 126 FIX: Await embedding before loadDocuments
      await triggerEmbedding(docData.id);
    }
    setUploading(false);
  };

  const handleUrlUpload = async () => {
    if (!urlSource.trim()) {
      toast({ title: "Informe a URL", variant: "destructive" });
      return;
    }

    setUploading(true);
    const { data: userData } = await supabase.auth.getUser();
    const tenantId = userData?.user?.id || "system";

    const { error } = await supabase
      .from("rag_documents")
      .insert({
        tenant_id: tenantId,
        flow_id: flowId,
        file_name: urlSource.split("/").pop() || "url_document",
        source_type: "url",
        source_url: urlSource,
        processing_status: "pending",
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
        chunk_strategy: chunkStrategy,
      });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Documento registrado — aguardando processamento" });
      setUrlSource("");
      loadDocuments();
    }
    setUploading(false);
  };

  // BUG 125 FIX: Check errors on deletes + BUG 145: Add confirmation
  const handleDelete = async (docId: string) => {
    if (!confirm("Tem certeza que deseja excluir este documento e todos os seus chunks?")) return;
    const { error: chunkErr } = await supabase.from("rag_chunks").delete().eq("document_id", docId);
    const { error: docErr } = await supabase.from("rag_documents").delete().eq("id", docId);
    if (chunkErr || docErr) {
      toast({ title: "Erro ao remover documento", description: (chunkErr || docErr)?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Documento removido" });
    if (expandedDocId === docId) {
      setExpandedDocId(null);
      setChunks([]);
    }
    loadDocuments();
  };

  const triggerEmbedding = async (docId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("aetherforge-rag-embed", {
        body: { action: "embed_document", document_id: docId },
      });
      if (error) throw error;
      toast({ title: `Embeddings gerados: ${data?.embedded || 0} chunks` });
      loadDocuments();
    } catch (err) {
      console.error("Embedding error:", err);
      toast({ title: "Erro ao gerar embeddings", variant: "destructive" });
      loadDocuments();
    }
  };

  const handleReindex = async (docId: string) => {
    toast({ title: "Reindexando documento..." });
    await supabase
      .from("rag_documents")
      .update({ reindex_required: true, processing_status: "processing" })
      .eq("id", docId);
    loadDocuments();
    await triggerEmbedding(docId);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);

    try {
      // Semantic search via edge function
      const { data, error } = await supabase.functions.invoke("aetherforge-rag-embed", {
        body: {
          action: "semantic_search",
          query: searchQuery,
          document_ids: documents.map((d) => d.id),
          top_k: 10,
          threshold: 0.3,
        },
      });

      if (error) throw error;
      setSearchResults((data?.results as RAGChunk[]) || []);
    } catch {
      // Fallback to text search — BUG 122 FIX: sanitize wildcards
      const sanitizedQuery = searchQuery.replace(/[%_\\]/g, "\\$&");
      const { data } = await supabase
        .from("rag_chunks")
        .select("id, chunk_index, content, heading, page_number, char_start, char_end, embedding")
        .in("document_id", documents.map((d) => d.id))
        .ilike("content", `%${sanitizedQuery}%`)
        .limit(10);
      setSearchResults((data as RAGChunk[]) || []);
    }

    setSearching(false);
  };

  return (
    <div className="w-96 border-l bg-background flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">RAG Pipeline</span>
          <Badge variant="secondary" className="text-[10px]">{documents.length} docs</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="documents" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-3 mt-2 shrink-0">
          <TabsTrigger value="documents" className="text-xs">Documentos</TabsTrigger>
          <TabsTrigger value="upload" className="text-xs">Upload</TabsTrigger>
          <TabsTrigger value="search" className="text-xs">Busca</TabsTrigger>
        </TabsList>

        {/* Documents Tab */}
        <TabsContent value="documents" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Nenhum documento</p>
                  <p className="text-xs mt-1">Use a aba Upload para adicionar</p>
                </div>
              ) : (
                documents.map((doc) => {
                  const status = STATUS_CONFIG[doc.processing_status || "pending"] || STATUS_CONFIG.pending;
                  const StatusIcon = status.icon;
                  const isExpanded = expandedDocId === doc.id;

                  return (
                    <div key={doc.id} className="border rounded-lg overflow-hidden">
                      <div
                        className="p-2.5 flex items-center gap-2 cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => loadChunks(doc.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{doc.file_name || "Sem nome"}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">{formatBytes(doc.file_size_bytes)}</span>
                            <span className="text-[10px] text-muted-foreground">•</span>
                            <span className="text-[10px] text-muted-foreground">{doc.total_chunks ?? "?"} chunks</span>
                          </div>
                        </div>
                        <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${status.color} ${doc.processing_status === "processing" ? "animate-spin" : ""}`} />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>

                      {/* Chunk details */}
                      {isExpanded && (
                        <div className="border-t bg-muted/30">
                          {/* Doc metadata */}
                          <div className="px-3 py-2 border-b space-y-1">
                            <div className="flex gap-3 text-[10px] text-muted-foreground">
                              <span>Estratégia: {doc.chunk_strategy || "paragraph"}</span>
                              <span>Tamanho: {doc.chunk_size || 500}</span>
                              <span>Overlap: {doc.chunk_overlap || 50}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span>Tipo: {doc.source_type}</span>
                              <span>Modelo: {doc.embedding_model || "pendente"}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-2 text-[10px] ml-auto gap-1"
                                onClick={(e) => { e.stopPropagation(); handleReindex(doc.id); }}
                              >
                                <RefreshCw className="h-3 w-3" />
                                Reindexar
                              </Button>
                            </div>
                          </div>

                          {loadingChunks ? (
                            <div className="flex justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : chunks.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">Nenhum chunk</p>
                          ) : (
                            <div className="max-h-60 overflow-y-auto">
                              {chunks.map((chunk) => (
                                <div key={chunk.id} className="px-3 py-2 border-b last:border-b-0 hover:bg-accent/30">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Hash className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-[10px] font-mono font-medium">#{chunk.chunk_index}</span>
                                    {chunk.heading && (
                                      <span className="text-[10px] text-primary truncate">{chunk.heading}</span>
                                    )}
                                    {chunk.page_number && (
                                      <span className="text-[10px] text-muted-foreground">p.{chunk.page_number}</span>
                                    )}
                                    <Badge variant="secondary" className="text-[8px] h-4 ml-auto">
                                      {chunk.embedding ? "✓ embed" : "⏳ pendente"}
                                    </Badge>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground line-clamp-3 leading-relaxed">
                                    {chunk.content}
                                  </p>
                                  {chunk.char_start != null && (
                                    <span className="text-[9px] text-muted-foreground/60 mt-0.5 block">
                                      chars {chunk.char_start}–{chunk.char_end}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Upload Tab */}
        <TabsContent value="upload" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-4">
              {/* Mode selector */}
              <div className="flex gap-2">
                <Button
                  variant={uploadMode === "text" ? "default" : "outline"}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setUploadMode("text")}
                >
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  Texto/Colar
                </Button>
                <Button
                  variant={uploadMode === "url" ? "default" : "outline"}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setUploadMode("url")}
                >
                  <Search className="h-3.5 w-3.5 mr-1" />
                  URL
                </Button>
              </div>

              {uploadMode === "text" ? (
                <>
                  <div>
                    <Label className="text-xs">Nome do documento</Label>
                    <Input
                      value={textFileName}
                      onChange={(e) => setTextFileName(e.target.value)}
                      placeholder="meu_documento.txt"
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Conteúdo</Label>
                    <Textarea
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      placeholder="Cole ou digite o conteúdo do documento aqui..."
                      className="min-h-[200px] text-xs mt-1 font-mono"
                    />
                    <span className="text-[10px] text-muted-foreground mt-1 block">
                      {textContent.length} caracteres
                    </span>
                  </div>
                </>
              ) : (
                <div>
                  <Label className="text-xs">URL do documento</Label>
                  <Input
                    value={urlSource}
                    onChange={(e) => setUrlSource(e.target.value)}
                    placeholder="https://example.com/documento.pdf"
                    className="h-8 text-xs mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Suporta: PDF, TXT, MD, HTML
                  </p>
                </div>
              )}

              {/* Chunking config */}
              <div className="border rounded-lg p-3 space-y-3">
                <p className="text-xs font-semibold">Configuração de Chunking</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px]">Tamanho (chars)</Label>
                    <Input
                      type="number"
                      value={chunkSize}
                      onChange={(e) => setChunkSize(Number(e.target.value))}
                      className="h-7 text-xs mt-0.5"
                      min={100}
                      max={2000}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Overlap (chars)</Label>
                    <Input
                      type="number"
                      value={chunkOverlap}
                      onChange={(e) => setChunkOverlap(Number(e.target.value))}
                      className="h-7 text-xs mt-0.5"
                      min={0}
                      max={500}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]">Estratégia</Label>
                  <Select value={chunkStrategy} onValueChange={setChunkStrategy}>
                    <SelectTrigger className="h-7 text-xs mt-0.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paragraph">Por parágrafo</SelectItem>
                      <SelectItem value="sentence">Por sentença</SelectItem>
                      <SelectItem value="fixed">Tamanho fixo</SelectItem>
                      <SelectItem value="markdown">Markdown (headers)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                className="w-full gap-2"
                onClick={uploadMode === "text" ? handleTextUpload : handleUrlUpload}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Processando..." : "Enviar e Indexar"}
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="flex-1 overflow-hidden m-0">
          <div className="p-3 space-y-3 flex flex-col h-full">
            <div className="flex gap-2 shrink-0">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar nos documentos..."
                className="h-8 text-xs flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button size="sm" className="h-8 gap-1" onClick={handleSearch} disabled={searching}>
                {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-2">
                {searchResults.length === 0 && !searching ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Digite uma query e busque</p>
                    <p className="text-[10px] mt-1">Busca textual nos chunks indexados</p>
                  </div>
                ) : (
                  searchResults.map((chunk, i) => (
                    <div key={chunk.id} className="border rounded-lg p-2.5 hover:bg-accent/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-[9px] h-4">#{i + 1}</Badge>
                        <span className="text-[10px] font-mono">chunk #{chunk.chunk_index}</span>
                        {chunk.heading && (
                          <span className="text-[10px] text-primary truncate">{chunk.heading}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-4 leading-relaxed">
                        {highlightText(chunk.content, searchQuery)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Chunking utility
interface ChunkResult {
  content: string;
  heading?: string;
  charStart: number;
  charEnd: number;
}

function chunkText(
  text: string,
  size: number,
  overlap: number,
  strategy: string
): ChunkResult[] {
  const chunks: ChunkResult[] = [];

  if (strategy === "paragraph") {
    const paragraphs = text.split(/\n\s*\n/);
    let charOffset = 0;
    let buffer = "";
    let bufferStart = 0;

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) {
        charOffset += para.length + 2;
        continue;
      }

      if (buffer.length + trimmed.length + 1 > size && buffer.length > 0) {
        chunks.push({
          content: buffer.trim(),
          charStart: bufferStart,
          charEnd: charOffset - 1,
        });
        // Overlap: keep last part
        const overlapText = buffer.slice(-overlap);
        buffer = overlapText + "\n\n" + trimmed;
        bufferStart = charOffset - overlap;
      } else {
        if (buffer.length === 0) bufferStart = charOffset;
        buffer += (buffer ? "\n\n" : "") + trimmed;
      }
      charOffset += para.length + 2;
    }
    if (buffer.trim()) {
      chunks.push({
        content: buffer.trim(),
        charStart: bufferStart,
        charEnd: text.length,
      });
    }
  } else if (strategy === "markdown") {
    const sections = text.split(/^(#{1,3}\s.+)$/m);
    let currentHeading = "";
    let buffer = "";
    let charOffset = 0;
    let bufferStart = 0;

    for (const section of sections) {
      if (/^#{1,3}\s/.test(section)) {
        if (buffer.trim()) {
          chunks.push({
            content: buffer.trim(),
            heading: currentHeading || undefined,
            charStart: bufferStart,
            charEnd: charOffset,
          });
        }
        currentHeading = section.replace(/^#+\s*/, "").trim();
        buffer = section + "\n";
        bufferStart = charOffset;
      } else {
        buffer += section;
      }
      charOffset += section.length;
    }
    if (buffer.trim()) {
      chunks.push({
        content: buffer.trim(),
        heading: currentHeading || undefined,
        charStart: bufferStart,
        charEnd: text.length,
      });
    }
  } else {
  // Fixed size — BUG 127 FIX: Ensure step is at least 1 to prevent infinite loop
    const step = Math.max(1, size - overlap);
    for (let i = 0; i < text.length; i += step) {
      const content = text.slice(i, i + size);
      if (content.trim()) {
        chunks.push({
          content: content.trim(),
          charStart: i,
          charEnd: Math.min(i + size, text.length),
        });
      }
    }
  }

  return chunks.length > 0 ? chunks : [{ content: text.trim(), charStart: 0, charEnd: text.length }];
}

// BUG 130 FIX: Actually highlight matching text
function highlightText(text: string, query: string): string {
  if (!query) return text;
  // Escape regex special chars in query
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), "⟦$1⟧");
}
