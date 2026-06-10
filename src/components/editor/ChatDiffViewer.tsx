// ChatDiffViewer.tsx — Diff viewer inline para o chat
// Mostra os diffs capturados (fs_write/fs_edit) em formato colapsável.
// Para revisão visual, não tem workflow de accept/reject (as mudanças já foram aplicadas).
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { registerForgeTheme } from "@/lib/monaco-theme";
import { getLanguageFromPath } from "./fileIcons";
import { ChevronDown, ChevronUp, GitCompare, FilePlus, FileEdit } from "lucide-react";

export interface ChatDiff {
  id: string;
  path: string;
  before: string;
  after: string;
  op: "write" | "edit";
  timestamp: number;
}

interface ChatDiffViewerProps {
  diffs: ChatDiff[];
  onDismiss?: (id: string) => void;
  /** inspector = paleta FORGE completa; chat = compacto no thread */
  variant?: "chat" | "inspector";
  /** Se true, começa expandido (auto-expande em tempo real) */
  defaultExpanded?: boolean;
}

export function ChatDiffViewer({ diffs, onDismiss, variant = "chat", defaultExpanded = false }: ChatDiffViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  // Auto-expande na primeira aparição de diffs novos
  useEffect(() => {
    if (diffs.length > 0 && openIds.size === 0) {
      const firstId = diffs[diffs.length - 1]!.id;
      setOpenIds(new Set([firstId]));
      setActiveId(firstId);
    }
  }, [diffs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDiffMount: DiffOnMount = useCallback((_e, monaco) => {
    registerForgeTheme(monaco);
    monaco.editor.setTheme("forge");
  }, []);

  const toggleOpen = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setActiveId(id);
  }, []);

  const isNew = (d: ChatDiff) => Date.now() - d.timestamp < 1500;

  if (diffs.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`forge-chat-diffs border border-[var(--forge-border)] rounded-lg overflow-hidden mb-3 ${
        variant === "inspector"
          ? "bg-[var(--forge-surface-1)] forge-chat-diffs--inspector"
          : "bg-[var(--forge-bg)]/40"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--forge-bg)]/60 transition-colors"
        aria-expanded={expanded}
      >
        <GitCompare className="size-3.5 text-[var(--forge-primary)] shrink-0" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--forge-primary)]">
          Mudanças do agente
        </span>
        <span className="font-mono text-[10px] text-[var(--forge-ghost)]">
          · {diffs.length} arquivo{diffs.length === 1 ? "" : "s"}
        </span>
        {expanded ? (
          <ChevronUp className="size-3.5 text-[var(--forge-ghost)] ml-auto" />
        ) : (
          <ChevronDown className="size-3.5 text-[var(--forge-ghost)] ml-auto" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--forge-border)]">
              <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-[var(--forge-border)] bg-[var(--forge-bg)]/30">
                {diffs.map((d) => {
                  const isOpen = openIds.has(d.id);
                  const isActive = activeId === d.id;
                  const OpIcon = d.op === "write" ? FilePlus : FileEdit;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleOpen(d.id)}
                      className={`group flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                        isActive
                          ? "bg-[var(--forge-primary)]/15 text-[var(--forge-primary)]"
                          : "text-[var(--forge-silver)] hover:bg-[var(--forge-bg)]/60"
                      }`}
                    >
                      <OpIcon className="size-3 shrink-0 opacity-70" />
                      <span className="truncate max-w-[140px]">{d.path.split("/").pop()}</span>
                      {isNew(d) && (
                        <span className="size-1.5 rounded-full bg-[var(--forge-primary)] animate-pulse shrink-0" />
                      )}
                      {isOpen ? (
                        <ChevronUp className="size-3 shrink-0 opacity-50" />
                      ) : (
                        <ChevronDown className="size-3 shrink-0 opacity-50" />
                      )}
                    </button>
                  );
                })}
              </div>

              {diffs
                .filter((d) => openIds.has(d.id))
                .map((d) => (
                  <div
                    key={d.id}
                    className="border-b border-[var(--forge-border)] last:border-b-0"
                  >
                    <div className="flex items-center gap-2 px-3 py-1.5 font-mono text-[10px] text-[var(--forge-ghost)]">
                      <span className="text-[var(--forge-primary)]">{d.path}</span>
                      <span>·</span>
                      <span>{d.op === "write" ? "criou/sobrescreveu" : "editou"}</span>
                      {onDismiss && (
                        <button
                          type="button"
                          onClick={() => onDismiss(d.id)}
                          className="ml-auto text-[var(--forge-ghost)] hover:text-[var(--forge-silver)]"
                        >
                          ocultar
                        </button>
                      )}
                    </div>
                    <div className="h-[260px] border-t border-[var(--forge-border)]">
                      <DiffEditor
                        original={d.before}
                        modified={d.after}
                        language={getLanguageFromPath(d.path)}
                        theme="forge"
                        onMount={handleDiffMount as DiffOnMount}
                        options={{
                          readOnly: true,
                          renderSideBySide: true,
                          fontSize: 11,
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          lineNumbers: "on",
                          renderIndicators: true,
                          diffWordWrap: "off",
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
