// ShortcutCheatsheet.tsx — Overlay de atalhos do editor (Cmd+?)
// Inspiração: VS Code / Cursor keyboard shortcut reference
import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Command } from "lucide-react";

interface Shortcut {
  keys: string[];
  label: string;
  category: string;
}

interface ShortcutCheatsheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const spring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 38,
  mass: 0.8,
};

const shortcuts: Shortcut[] = [
  // Globais
  { keys: ["⌘", "K"], label: "Command Palette", category: "Global" },
  { keys: ["⌘", "P"], label: "Quick Open File", category: "Global" },
  { keys: ["⌘", "?"], label: "Atalhos", category: "Global" },
  // Arquivos
  { keys: ["⌘", "N"], label: "Novo Arquivo", category: "Arquivos" },
  { keys: ["⌘", "⇧", "N"], label: "Nova Pasta", category: "Arquivos" },
  { keys: ["⌘", "S"], label: "Salvar Tudo", category: "Arquivos" },
  { keys: ["⌘", "B"], label: "Toggle File Tree", category: "Arquivos" },
  // Editor
  { keys: ["⌘", "D"], label: "Selecionar próxima ocorrência", category: "Editor" },
  { keys: ["⌘", "⇧", "L"], label: "Selecionar todas ocorrências", category: "Editor" },
  { keys: ["⌘", "/"], label: "Toggle comentário", category: "Editor" },
  { keys: ["F2"], label: "Renomear símbolo", category: "Editor" },
  { keys: ["⌥", "↑"], label: "Mover linha para cima", category: "Editor" },
  { keys: ["⌥", "↓"], label: "Mover linha para baixo", category: "Editor" },
  { keys: ["⌘", "↵"], label: "Selecionar sugestão", category: "Editor" },
  // Agente
  { keys: ["⌘", "↵"], label: "Executar FORGE", category: "Agente" },
  { keys: ["⌘", "."], label: "Parar Agente", category: "Agente" },
  // Preview
  { keys: ["⌘", "⇧", "P"], label: "Toggle Preview", category: "View" },
  { keys: ["⌘", "J"], label: "Toggle Terminal", category: "View" },
  { keys: ["⌘", "⇧", "G"], label: "Toggle Git Panel", category: "View" },
];

const grouped = shortcuts.reduce(
  (acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  },
  {} as Record<string, Shortcut[]>,
);

export function ShortcutCheatsheet({ isOpen, onClose }: ShortcutCheatsheetProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "?") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] bg-[var(--background)]/80 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={spring}
            className="fixed top-[10%] left-1/2 -translate-x-1/2 z-[101] w-[620px] max-h-[500px] bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 h-12 border-b border-[var(--border)] shrink-0">
              <div className="flex items-center gap-2">
                <Command className="size-4 text-[var(--primary)]" />
                <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--foreground)]">
                  ATALHOS DO EDITOR
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-[var(--surface-2)] transition-colors"
              >
                <X className="size-4 text-[var(--text-dim)]" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                {Object.entries(grouped).map(([category, items]) => (
                  <div key={category} className="space-y-2">
                    <h3 className="font-mono text-[9px] tracking-[0.25em] uppercase text-[var(--primary)]/70">
                      {category}
                    </h3>
                    <div className="space-y-1">
                      {items.map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center justify-between py-1"
                        >
                          <span className="font-mono text-[11px] text-[var(--text-dim)]">
                            {item.label}
                          </span>
                          <div className="flex items-center gap-0.5">
                            {item.keys.map((k, i) => (
                              <span
                                key={i}
                                className="font-mono text-[9px] text-[var(--text-ghost)] px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] min-w-[18px] text-center"
                              >
                                {k}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center h-8 border-t border-[var(--border)] shrink-0">
              <span className="font-mono text-[9px] text-[var(--text-ghost)]">
                Pressione{" "}
                <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] text-[8px]">
                  ESC
                </kbd>{" "}
                ou{" "}
                <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] text-[8px]">
                  ⌘?
                </kbd>{" "}
                para fechar
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
