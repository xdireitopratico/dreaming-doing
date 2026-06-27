/**
 * NodePalette — Collapsible sidebar with search and categorized nodes
 * Redesigned: n8n-inspired with real-time search + collapsible categories
 */
import { useState } from "react";
import { Bot, Zap, GitBranch, Shield, Wrench, Mic, Volume2, Search, Brain, Clock, ArrowRightLeft, AlertTriangle, Users, Package, Settings, Eye, ChevronRight, ChevronLeft, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PaletteItem {
  type: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

const ALL_ITEMS: PaletteItem[] = [
  { type: "trigger", label: "Trigger", icon: <Zap className="h-3.5 w-3.5" />, color: "bg-emerald-500", description: "Ponto de entrada" },
  { type: "llm", label: "LLM", icon: <Bot className="h-3.5 w-3.5" />, color: "bg-blue-500", description: "Geração de texto com IA" },
  { type: "tool", label: "Tool", icon: <Wrench className="h-3.5 w-3.5" />, color: "bg-yellow-500", description: "Ferramenta externa" },
  { type: "condition", label: "Condição", icon: <GitBranch className="h-3.5 w-3.5" />, color: "bg-gray-500", description: "Branch if/else" },
  { type: "switch", label: "Switch", icon: <GitBranch className="h-3.5 w-3.5" />, color: "bg-indigo-500", description: "Branch multi-caso" },
  { type: "transformer", label: "Transformer", icon: <Settings className="h-3.5 w-3.5" />, color: "bg-cyan-500", description: "Transformar dados" },
  { type: "loop", label: "Loop", icon: <ArrowRightLeft className="h-3.5 w-3.5" />, color: "bg-slate-500", description: "Repetição" },
  { type: "rag_search", label: "RAG Search", icon: <Search className="h-3.5 w-3.5" />, color: "bg-amber-700", description: "Busca em documentos" },
  { type: "memory", label: "Memória", icon: <Brain className="h-3.5 w-3.5" />, color: "bg-pink-500", description: "Ler/escrever memória" },
  { type: "stt", label: "STT", icon: <Mic className="h-3.5 w-3.5" />, color: "bg-purple-500", description: "Transcrição de áudio" },
  { type: "tts", label: "TTS", icon: <Volume2 className="h-3.5 w-3.5" />, color: "bg-orange-500", description: "Síntese de voz" },
  { type: "vision", label: "Vision", icon: <Eye className="h-3.5 w-3.5" />, color: "bg-violet-600", description: "Análise de imagem" },
  { type: "delay", label: "Delay", icon: <Clock className="h-3.5 w-3.5" />, color: "bg-gray-400", description: "Esperar tempo" },
  { type: "error_handler", label: "Error Handler", icon: <AlertTriangle className="h-3.5 w-3.5" />, color: "bg-red-600", description: "Tratamento de erros" },
  { type: "hitl", label: "Aprovação", icon: <Users className="h-3.5 w-3.5" />, color: "bg-red-500", description: "Aprovação humana" },
  { type: "sub_flow", label: "Sub-Flow", icon: <Package className="h-3.5 w-3.5" />, color: "bg-gray-800", description: "Invocar outro flow" },
  { type: "output_guard", label: "Output Guard", icon: <Shield className="h-3.5 w-3.5" />, color: "bg-amber-500", description: "Filtro de segurança" },
];

const CATEGORIES = [
  { id: "input", label: "Entrada", types: ["trigger"] },
  { id: "processing", label: "Processamento", types: ["llm", "condition", "switch", "transformer", "loop"] },
  { id: "data", label: "Dados", types: ["rag_search", "memory"] },
  { id: "io", label: "Comunicação", types: ["tool", "stt", "tts", "vision"] },
  { id: "control", label: "Controle", types: ["delay", "error_handler", "hitl", "sub_flow"] },
  { id: "security", label: "Segurança", types: ["output_guard"] },
];

interface NodePaletteProps {
  onAddNode?: (nodeType: string) => void;
}

export function NodePalette({ onAddNode }: NodePaletteProps = {}) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(CATEGORIES.map(c => c.id)));

  const toggleCat = (id: string) => {
    setOpenCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  const onClick = (nodeType: string) => {
    onAddNode?.(nodeType);
  };

  const q = search.toLowerCase();
  const filtered = q ? ALL_ITEMS.filter(i => i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)) : null;

  if (collapsed) {
    return (
      <div className="w-10 flex flex-col items-center pt-2 shrink-0" style={{ background: 'var(--ps-bg)', borderRight: '1px solid var(--ps-border)' }}>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed(false)} title="Expandir painel de nós" style={{ color: 'var(--ps-cream-60)' }}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-48 overflow-y-auto shrink-0" style={{ background: 'var(--ps-bg)', borderRight: '1px solid var(--ps-border)', color: 'var(--ps-cream)' }}>
      {/* Search + Collapse */}
      <div className="p-2 flex items-center gap-1" style={{ borderBottom: '1px solid var(--ps-border)' }}>
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nós..."
            className="h-7 text-[10px] pl-6 pr-2 border-none"
            style={{ background: 'linear-gradient(135deg, #1a1e27, #0b0d12)', color: 'var(--ps-cream)' }}
          />
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setCollapsed(true)} title="Recolher" style={{ color: 'var(--ps-cream-40)' }}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Search results */}
      {filtered ? (
        <div className="p-1.5 space-y-0.5">
          {filtered.length === 0 && (
            <p className="text-[10px] text-center py-4" style={{ color: 'var(--ps-cream-40)' }}>Nenhum resultado</p>
          )}
          {filtered.map(item => (
            <PaletteItemRow key={item.type} item={item} onDragStart={onDragStart} onClick={onClick} />
          ))}
        </div>
      ) : (
        /* Categorized view */
        <div className="py-1">
          {CATEGORIES.map(cat => {
            const items = ALL_ITEMS.filter(i => cat.types.includes(i.type));
            return (
              <Collapsible key={cat.id} open={openCats.has(cat.id)} onOpenChange={() => toggleCat(cat.id)}>
                <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-white/5" style={{ color: 'var(--ps-cream-40)' }}>
                  <ChevronDown className={`h-3 w-3 transition-transform ${openCats.has(cat.id) ? "" : "-rotate-90"}`} />
                  {cat.label}
                  <span className="ml-auto text-[9px] font-normal">{items.length}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-1.5 pb-1 space-y-0.5">
                    {items.map(item => (
                      <PaletteItemRow key={item.type} item={item} onDragStart={onDragStart} onClick={onClick} />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaletteItemRow({ item, onDragStart, onClick }: { item: PaletteItem; onDragStart: (e: React.DragEvent, type: string) => void; onClick: (type: string) => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item.type)}
      onClick={() => onClick(item.type)}
      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer active:cursor-grabbing transition-colors hover:bg-white/5"
      title={`${item.description} — Clique ou arraste`}
    >
      <div className={`${item.color} text-white p-1 rounded shrink-0`}>
        {item.icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium truncate" style={{ color: 'var(--ps-cream-80)' }}>{item.label}</div>
      </div>
    </div>
  );
}
