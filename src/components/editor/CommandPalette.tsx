// CommandPalette.tsx — Cmd+K custom palette, nível Cursor/Windsurf
// Fuzzy search, ações do editor, toggle de views, atalhos visuais
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  FilePlus,
  FolderPlus,
  Eye,
  Code2,
  Terminal,
  GitBranch,
  Download,
  Upload,
  Save,
  Play,
  Square,
  Settings,
  Zap,
  ChevronRight,
  Monitor,
  Smartphone,
  Tablet,
  History,
  Undo2,
  Redo2,
  Sun,
  Moon,
  Keyboard,
  FileCode,
  FolderOpen,
} from "lucide-react";

export interface PaletteAction {
  id: string;
  label: string;
  description?: string;
  category: "file" | "view" | "agent" | "layout" | "project";
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  actions: PaletteAction[];
  /** Files available for Cmd+P quick-open mode */
  files?: string[];
  /** Called when a file is selected in quick-open mode */
  onOpenFile?: (path: string) => void;
  children?: React.ReactNode;
}

const spring = {
  type: "spring" as const,
  stiffness: 500,
  damping: 40,
  mass: 0.8,
};

export function CommandPalette({
  isOpen,
  onClose,
  actions,
  files = [],
  onOpenFile,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    // In command mode (starts with ">"), only show commands
    if (q.startsWith(">")) {
      const cmdQ = q.slice(1).trim();
      if (!cmdQ) return actions;
      return actions.filter(
        (a) =>
          a.label.toLowerCase().includes(cmdQ) ||
          a.description?.toLowerCase().includes(cmdQ) ||
          a.category.toLowerCase().includes(cmdQ) ||
          a.shortcut?.toLowerCase().includes(cmdQ),
      );
    }
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.shortcut?.toLowerCase().includes(q),
    );
  }, [actions, query]);

  // File search results (shown alongside commands when not in ">" mode)
  const fileResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.startsWith(">")) return [];
    return files
      .filter((f) => f.toLowerCase().includes(q))
      .slice(0, 8)
      .map((f) => ({
        id: `file:${f}`,
        label: f.split("/").pop() ?? f,
        description: f,
        category: "file-search" as PaletteAction["category"] & "file-search",
        icon: <FileCode className="size-4" />,
        action: () => onOpenFile?.(f),
      }));
  }, [query, files, onOpenFile]);

  const hasExplicitActionSearch = query.trim().toLowerCase().startsWith(">");

  // Clamp selected index
  const idx = Math.min(selectedIdx, Math.max(0, filtered.length + fileResults.length - 1));

  const execute = useCallback(
    (action: PaletteAction | (typeof fileResults)[number]) => {
      action.action();
      onClose();
    },
    [onClose],
  );

  // All items (actions + file results)
  const allItems = useMemo(() => [...fileResults, ...filtered], [fileResults, filtered]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard nav
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIdx((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[idx]) execute(filtered[idx]);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, idx, filtered, execute, onClose]);

  // Global Cmd+K / Ctrl+K toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Parent handles opening via the isOpen prop
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const categoryIcons: Record<string, React.ReactNode> = {
    file: <FileCode className="size-3" />,
    view: <Eye className="size-3" />,
    agent: <Zap className="size-3" />,
    layout: <Monitor className="size-3" />,
    project: <FolderOpen className="size-3" />,
  };

  const categoryLabels: Record<string, string> = {
    file: "ARQUIVOS",
    view: "VISUALIZAÇÃO",
    agent: "AGENTE",
    layout: "LAYOUT",
    project: "PROJETO",
  };

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, PaletteAction[]>();
    for (const a of filtered) {
      const list = map.get(a.category) ?? [];
      list.push(a);
      map.set(a.category, list);
    }
    // Fixed order
    const order = ["file", "view", "agent", "layout", "project"];
    return order
      .filter((cat) => map.has(cat))
      .map((cat) => ({ category: cat, items: map.get(cat)! }));
  }, [filtered]);

  // Calculate global index for keyboard nav
  let globalIdx = 0;
  const groupedWithIndex = grouped.map((g) => ({
    ...g,
    items: g.items.map((item) => ({ ...item, globalIdx: globalIdx++ })),
  }));

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] bg-[var(--background)]/80 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={spring}
            className="fixed top-[15%] left-1/2 -translate-x-1/2 z-[101] w-[560px] max-h-[420px] bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col"
          >
            {/* Search */}
            <div className="flex items-center gap-2.5 px-4 h-12 border-b border-[var(--border)] shrink-0">
              <Search className="size-4 text-[var(--text-ghost)] shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIdx(0);
                }}
                placeholder="> comandos  •  buscar arquivos..."
                className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--text-ghost)] outline-none font-mono"
              />
              <kbd className="font-mono text-[9px] text-[var(--text-ghost)] px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)]">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto py-2">
              {groupedWithIndex.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <Search className="size-6 text-[var(--text-ghost)]" />
                  <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-ghost)]">
                    NENHUM COMANDO ENCONTRADO
                  </span>
                </div>
              ) : (
                groupedWithIndex.map((group) => (
                  <div key={group.category} className="mb-1 last:mb-0">
                    <div className="flex items-center gap-1.5 px-4 py-1.5">
                      <span className="text-[var(--text-ghost)]">
                        {categoryIcons[group.category]}
                      </span>
                      <span className="font-mono text-[8px] tracking-[0.25em] uppercase text-[var(--text-ghost)]">
                        {categoryLabels[group.category]}
                      </span>
                    </div>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => execute(item)}
                        onMouseEnter={() => setSelectedIdx(item.globalIdx)}
                        className={`w-full flex items-center gap-3 px-5 py-2 transition-colors text-left ${
                          idx === item.globalIdx
                            ? "bg-[var(--primary)]/10 text-[var(--foreground)]"
                            : "text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        <span
                          className={
                            idx === item.globalIdx
                              ? "text-[var(--primary)]"
                              : "text-[var(--text-ghost)]"
                          }
                        >
                          {item.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[12px] truncate">{item.label}</div>
                          {item.description && (
                            <div className="font-mono text-[9px] text-[var(--text-ghost)] truncate">
                              {item.description}
                            </div>
                          )}
                        </div>
                        {item.shortcut && (
                          <kbd className="font-mono text-[9px] text-[var(--text-ghost)] px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] shrink-0">
                            {item.shortcut}
                          </kbd>
                        )}
                        {idx === item.globalIdx && (
                          <ChevronRight className="size-3 text-[var(--primary)] shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-4 px-4 h-8 border-t border-[var(--border)] shrink-0">
              <span className="flex items-center gap-1 font-mono text-[9px] text-[var(--text-ghost)]">
                <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] text-[8px]">
                  ↑↓
                </kbd>{" "}
                navegar
              </span>
              <span className="flex items-center gap-1 font-mono text-[9px] text-[var(--text-ghost)]">
                <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] text-[8px]">
                  ↵
                </kbd>{" "}
                executar
              </span>
              <span className="flex items-center gap-1 font-mono text-[9px] text-[var(--text-ghost)]">
                <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] text-[8px]">
                  ESC
                </kbd>{" "}
                fechar
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// -------------------------------------------------------------------------
// Pre-built action sets
// -------------------------------------------------------------------------

export function buildEditorActions({
  onNewFile,
  onNewFolder,
  onTogglePreview,
  onToggleTerminal,
  onToggleGit,
  onExportZip,
  onImportFiles,
  onSaveAll,
  onRunAgent,
  onStopAgent,
  onToggleFileTree,
  onToggleDeviceFrame,
  onOpenHistory,
  isRunning,
}: {
  onNewFile: () => void;
  onNewFolder: () => void;
  onTogglePreview: () => void;
  onToggleTerminal: () => void;
  onToggleGit: () => void;
  onExportZip: () => void;
  onImportFiles: () => void;
  onSaveAll: () => void;
  onRunAgent: () => void;
  onStopAgent: () => void;
  onToggleFileTree: () => void;
  onToggleDeviceFrame: () => void;
  onOpenHistory: () => void;
  isRunning: boolean;
}): PaletteAction[] {
  return [
    // File
    {
      id: "new-file",
      label: "Novo Arquivo",
      description: "Criar um novo arquivo no projeto",
      category: "file",
      shortcut: "⌘N",
      icon: <FilePlus className="size-4" />,
      action: onNewFile,
    },
    {
      id: "new-folder",
      label: "Nova Pasta",
      description: "Criar uma nova pasta no projeto",
      category: "file",
      shortcut: "⌘⇧N",
      icon: <FolderPlus className="size-4" />,
      action: onNewFolder,
    },
    {
      id: "save-all",
      label: "Salvar Tudo",
      description: "Salvar todos os arquivos modificados",
      category: "file",
      shortcut: "⌘S",
      icon: <Save className="size-4" />,
      action: onSaveAll,
    },
    // View
    {
      id: "toggle-preview",
      label: "Alternar Preview",
      description: "Mostrar/ocultar o preview do projeto",
      category: "view",
      shortcut: "⌘⇧P",
      icon: <Eye className="size-4" />,
      action: onTogglePreview,
    },
    {
      id: "open-history",
      label: "Histórico do Agente",
      description: "Execuções e mudanças do FORGE neste projeto",
      category: "project",
      icon: <History className="size-4" />,
      action: onOpenHistory,
    },
    {
      id: "toggle-file-tree",
      label: "Explorador de Arquivos",
      description: "Mostrar/ocultar a árvore de arquivos",
      category: "view",
      shortcut: "⌘B",
      icon: <FolderOpen className="size-4" />,
      action: onToggleFileTree,
    },
    {
      id: "toggle-terminal",
      label: "Terminal",
      description: "Abrir/fechar painel do terminal",
      category: "view",
      shortcut: "⌘J",
      icon: <Terminal className="size-4" />,
      action: onToggleTerminal,
    },
    {
      id: "toggle-git",
      label: "Git Panel",
      description: "Mostrar/ocultar painel de Git",
      category: "view",
      shortcut: "⌘⇧G",
      icon: <GitBranch className="size-4" />,
      action: onToggleGit,
    },
    {
      id: "device-desktop",
      label: "Preview Desktop",
      description: "Visualizar em tela de desktop (1440px)",
      category: "view",
      icon: <Monitor className="size-4" />,
      action: onToggleDeviceFrame,
    },
    {
      id: "device-tablet",
      label: "Preview Tablet",
      description: "Visualizar em tablet (768px)",
      category: "view",
      icon: <Tablet className="size-4" />,
      action: onToggleDeviceFrame,
    },
    {
      id: "device-mobile",
      label: "Preview Mobile",
      description: "Visualizar em celular (375px)",
      category: "view",
      icon: <Smartphone className="size-4" />,
      action: onToggleDeviceFrame,
    },
    // Agent
    ...(isRunning
      ? [
          {
            id: "stop-agent",
            label: "Parar Agente",
            description: "Interromper execução do agente FORGE",
            category: "agent" as const,
            shortcut: "⌘.",
            icon: <Square className="size-4" />,
            action: onStopAgent,
          },
        ]
      : [
          {
            id: "run-agent",
            label: "Executar FORGE",
            description: "Iniciar geração de código com IA",
            category: "agent" as const,
            shortcut: "⌘↵",
            icon: <Play className="size-4" />,
            action: onRunAgent,
          },
        ]),
    // Project
    {
      id: "export-zip",
      label: "Exportar ZIP",
      description: "Baixar projeto como arquivo ZIP",
      category: "project",
      shortcut: "⌘⇧E",
      icon: <Download className="size-4" />,
      action: onExportZip,
    },
    {
      id: "import-files",
      label: "Importar Arquivos",
      description: "Fazer upload de arquivos para o projeto",
      category: "project",
      shortcut: "⌘⇧I",
      icon: <Upload className="size-4" />,
      action: onImportFiles,
    },
  ];
}
