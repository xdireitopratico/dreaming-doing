/**
 * NodeCreator — Full-screen overlay for node type selection
 * n8n-style: search bar + categorized grid + drag-to-canvas
 *
 * Opened via Tab key or shortcut from the flow builder.
 */
import { useState, useCallback, useEffect, useRef, memo } from "react";
import { Search, X } from "lucide-react";
import { NodeIcon, getNodeIconSource, getNodeIconSize, type NodeIconSource } from "./nodes/NodeIcon";

interface CreatorItem {
  type: string;
  label: string;
  icon: NodeIconSource;
  description: string;
  category: string;
}

const ALL_ITEMS: CreatorItem[] = [
  { type: "trigger", label: "Trigger", icon: getNodeIconSource("trigger"), description: "Ponto de entrada do fluxo", category: "trigger" },
  { type: "llm", label: "LLM", icon: getNodeIconSource("llm"), description: "Geração de texto com IA", category: "ai" },
  { type: "tool", label: "Tool", icon: getNodeIconSource("tool"), description: "Ferramenta externa / API", category: "actions" },
  { type: "condition", label: "Condição", icon: getNodeIconSource("condition"), description: "Desvio condicional if/else", category: "flow" },
  { type: "switch", label: "Switch", icon: getNodeIconSource("switch"), description: "Seleção multi-caso", category: "flow" },
  { type: "transformer", label: "Transformer", icon: getNodeIconSource("transformer"), description: "Transformar dados entre nós", category: "actions" },
  { type: "loop", label: "Loop", icon: getNodeIconSource("loop"), description: "Repetir execução", category: "flow" },
  { type: "rag_search", label: "RAG Search", icon: getNodeIconSource("rag_search"), description: "Busca semântica em documentos", category: "ai" },
  { type: "memory", label: "Memória", icon: getNodeIconSource("memory"), description: "Ler e escrever memória contextual", category: "ai" },
  { type: "stt", label: "STT", icon: getNodeIconSource("stt"), description: "Transcrição de áudio para texto", category: "ai" },
  { type: "tts", label: "TTS", icon: getNodeIconSource("tts"), description: "Síntese de texto para áudio", category: "ai" },
  { type: "vision", label: "Vision", icon: getNodeIconSource("vision"), description: "Análise de imagens", category: "ai" },
  { type: "delay", label: "Delay", icon: getNodeIconSource("delay"), description: "Aguardar um período", category: "flow" },
  { type: "error_handler", label: "Error Handler", icon: getNodeIconSource("error_handler"), description: "Tratamento de erros do fluxo", category: "flow" },
  { type: "hitl", label: "Aprovação", icon: getNodeIconSource("hitl"), description: "Aprovação humana no fluxo", category: "actions" },
  { type: "sub_flow", label: "Sub-Flow", icon: getNodeIconSource("sub_flow"), description: "Invocar outro fluxo", category: "flow" },
  { type: "output_guard", label: "Output Guard", icon: getNodeIconSource("output_guard"), description: "Filtro de segurança na saída", category: "actions" },
];

const CATEGORIES = [
  { id: "trigger", label: "Entrada", icon: "⚡" },
  { id: "ai", label: "IA", icon: "🤖" },
  { id: "actions", label: "Ações", icon: "🔧" },
  { id: "flow", label: "Fluxo", icon: "🔀" },
];

interface NodeCreatorProps {
  open: boolean;
  onClose: () => void;
  onAddNode: (nodeType: string) => void;
}

export const NodeCreator = memo(function NodeCreator({
  open, onClose, onAddNode,
}: NodeCreatorProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset state + focus input when opened
  useEffect(() => {
    if (open) {
      setSearch("");
      setCategory(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation within the overlay
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      // Enter selects first visible item
      if (e.key === "Enter" && search) {
        const q = search.toLowerCase();
        const visible = ALL_ITEMS.filter((i) =>
          (!category || i.category === category) &&
          (i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
        );
        if (visible.length > 0) {
          e.preventDefault();
          onAddNode(visible[0].type);
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [open, search, category, onAddNode, onClose]);

  // Click outside the panel closes
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  }, [onClose]);

  // Drag start
  const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
    onClose();
  }, [onClose]);

  // Click to add
  const handleClickAdd = useCallback((nodeType: string) => {
    onAddNode(nodeType);
    onClose();
  }, [onAddNode, onClose]);

  if (!open) return null;

  const q = search.toLowerCase();
  const filtered = ALL_ITEMS.filter((i) => {
    if (category && i.category !== category) return false;
    if (!q) return true;
    return i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q);
  });

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="flex flex-col w-full max-w-2xl mx-4 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{
          background: "var(--ps-bg, #15171e)",
          border: "1px solid var(--ps-border, #2a2d35)",
          maxHeight: "70vh",
        }}
      >
        {/* ── Header / Search ── */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--ps-border, #2a2d35)" }}>
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--ps-cream-40)" }} />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nós…"
            className="flex-1 bg-transparent border-none outline-none text-sm"
            style={{ color: "var(--ps-cream, #f0e6d7)" }}
          />
          <div className="flex items-center gap-1">
            {search && (
              <button
                onClick={() => setSearch("")}
                className="p-1 rounded hover:bg-white/5 transition-colors"
                style={{ color: "var(--ps-cream-40)" }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <kbd
              className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ background: "var(--ps-bg-deep, #0b0d12)", color: "var(--ps-cream-25)", border: "1px solid var(--ps-border, #2a2d35)" }}
            >
              ESC
            </kbd>
          </div>
        </div>

        {/* ── Category tabs ── */}
        <div className="flex gap-1 px-4 pt-3 pb-2 overflow-x-auto" style={{ borderBottom: "1px solid var(--ps-border, #2a2d35)" }}>
          <button
            onClick={() => setCategory(null)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap"
            style={{
              background: category === null ? "var(--ps-accent, #f59e0b)" : "var(--ps-bg-surface, #1a1c22)",
              color: category === null ? "#000" : "var(--ps-cream-60)",
              border: category === null ? "none" : "1px solid var(--ps-border, #2a2d35)",
            }}
          >
            Todos
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap flex items-center gap-1.5"
              style={{
                background: category === cat.id ? "var(--ps-accent, #f59e0b)" : "var(--ps-bg-surface, #1a1c22)",
                color: category === cat.id ? "#000" : "var(--ps-cream-60)",
                border: category === cat.id ? "none" : "1px solid var(--ps-border, #2a2d35)",
              }}
            >
              <span>{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>

        {/* ── Node grid ── */}
        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <div className="text-2xl">🔍</div>
              <p className="text-sm" style={{ color: "var(--ps-cream-40)" }}>
                Nenhum nó encontrado para "{search}"
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filtered.map((item) => (
                <button
                  key={item.type}
                  draggable
                  onDragStart={(e) => onDragStart(e, item.type)}
                  onClick={() => handleClickAdd(item.type)}
                  className="flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-100 cursor-pointer group hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: "var(--ps-bg-surface, #1a1c22)",
                    border: "1px solid var(--ps-border, #2a2d35)",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget;
                    el.style.borderColor = "var(--ps-accent, #f59e0b)";
                    el.style.background = "var(--ps-bg-surface-hover, #25282f)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget;
                    el.style.borderColor = "var(--ps-border, #2a2d35)";
                    el.style.background = "var(--ps-bg-surface, #1a1c22)";
                  }}
                >
                  <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <NodeIcon source={item.icon} size={getNodeIconSize("nodeList")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold truncate" style={{ color: "var(--ps-cream-80)" }}>
                      {item.label}
                    </div>
                    <div className="text-[10px] truncate" style={{ color: "var(--ps-cream-40)" }}>
                      {item.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer hint ── */}
        <div
          className="px-4 py-2 text-[10px] flex items-center gap-3"
          style={{ color: "var(--ps-cream-25)", borderTop: "1px solid var(--ps-border, #2a2d35)", background: "var(--ps-bg-deep, #0b0d12)" }}
        >
          <span>↵ <strong>Enter</strong> para adicionar</span>
          <span>↕ <strong>Arraste</strong> para o canvas</span>
          <span className="ml-auto">
            <strong>{filtered.length}</strong> nós
          </span>
        </div>
      </div>
    </div>
  );
});
