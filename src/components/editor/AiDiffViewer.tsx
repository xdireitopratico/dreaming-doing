// AiDiffViewer.tsx — Inline AI Diff Viewer com Accept/Reject
// Mostra mudanças feitas pelo agente em modo diff, Monaco nativo
// Inspiração: Windsurf cascading diffs + Cursor inline review
import { useCallback, useEffect, useRef, useState } from "react";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { motion, AnimatePresence } from "framer-motion";
import { useMonacoTheme } from "@/hooks/useMonacoTheme";
import { getLanguageFromPath } from "./fileIcons";
import { Check, X, ChevronDown, ChevronUp, GitCompare } from "lucide-react";
import { ForgeIcon } from "@/components/icons/ForgeIcon";

export interface DiffEntry {
  /** Unique ID — typically `${filePath}::${toolCallIndex}` */
  id: string;
  /** Relative file path */
  path: string;
  /** Content before the agent changed it */
  before: string;
  /** Content after the agent changed it */
  after: string;
  /** Who made the change (agent/tool name) */
  author?: string;
  /** Timestamp of the change */
  timestamp?: number;
  /** Whether the diff has been reviewed */
  reviewed?: boolean;
  /** Whether the diff was accepted or rejected */
  decision?: "accept" | "reject" | null;
}

interface AiDiffViewerProps {
  /** List of pending diffs from the agent */
  diffs: DiffEntry[];
  /** Called when user accepts a diff — parent applies the change */
  onAccept: (diffId: string) => void;
  /** Called when user rejects a diff — parent reverts to before */
  onReject: (diffId: string) => void;
  /** Called when user accepts all diffs at once */
  onAcceptAll: () => void;
  /** Called when user rejects all diffs at once */
  onRejectAll: () => void;
  /** Currently active diff ID */
  activeDiffId?: string | null;
  /** Select a specific diff */
  onSelectDiff?: (diffId: string) => void;
}

const spring = {
  type: "spring" as const,
  stiffness: 500,
  damping: 40,
  mass: 0.8,
};

export function AiDiffViewer({
  diffs,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  activeDiffId,
  onSelectDiff,
}: AiDiffViewerProps) {
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());

  const handleDiffMount: DiffOnMount = useCallback((editor, monaco) => {
    useMonacoTheme(monaco);
    monaco.editor.setTheme("forge");
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedDiffs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const pending = diffs.filter((d) => !d.reviewed && !d.decision);
  const hasPendingChanges = pending.length > 0;

  if (diffs.length === 0) return null;

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* Header bar */}
      {hasPendingChanges && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between h-9 px-3 border-b border-[var(--border)] bg-gradient-to-r from-[var(--primary)]/5 to-transparent shrink-0"
        >
          <div className="flex items-center gap-2">
            <ForgeIcon variant="craft" size={14} className="text-[var(--primary)]" />
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--foreground)]">
              AI DIFF ({pending.length})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onRejectAll}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-[var(--destructive)]/80 hover:bg-[var(--destructive)]/10 transition-colors"
            >
              <X className="size-3" />
              REJEITAR TODAS
            </button>
            <button
              onClick={onAcceptAll}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-mono bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-colors border border-[var(--primary)]/20"
            >
              <Check className="size-3" />
              ACEITAR TODAS
            </button>
          </div>
        </motion.div>
      )}

      {/* Diff list + selected diff viewer */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* File list sidebar */}
        <div className="border-b border-[var(--border)] bg-[var(--surface-1)]/40 overflow-x-auto shrink-0">
          <div className="flex items-center h-8 px-2 gap-0.5">
            <AnimatePresence mode="popLayout">
              {diffs
                .filter((d) => !d.decision)
                .map((diff) => (
                  <motion.button
                    key={diff.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9, x: -10 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, x: 10 }}
                    transition={spring}
                    onClick={() => {
                      toggleExpand(diff.id);
                      onSelectDiff?.(diff.id);
                    }}
                    className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono transition-all shrink-0 cursor-pointer ${
                      activeDiffId === diff.id
                        ? "bg-[var(--primary)]/15 text-[var(--primary)] ring-1 ring-[var(--primary)]/20"
                        : diff.reviewed
                          ? "text-[var(--text-ghost)] hover:text-[var(--text-dim)]"
                          : "text-[var(--foreground)] bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    <GitCompare className="size-3 shrink-0 opacity-60" />
                    <span className="truncate max-w-[120px]">
                      {diff.path.split("/").pop()}
                    </span>
                    {!diff.reviewed && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse shrink-0" />
                    )}
                    {expandedDiffs.has(diff.id) ? (
                      <ChevronUp className="size-3 shrink-0 opacity-40" />
                    ) : (
                      <ChevronDown className="size-3 shrink-0 opacity-40" />
                    )}
                  </motion.button>
                ))}
            </AnimatePresence>
            {diffs.filter((d) => !d.decision).length === 0 && (
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[var(--text-ghost)] px-3">
                Todas as mudanças revisadas
              </span>
            )}
          </div>
        </div>

        {/* Diff editor area */}
        <div className="flex-1 min-h-0">
          {activeDiffId ? (
            <AnimatePresence mode="wait">
              {diffs
                .filter((d) => d.id === activeDiffId)
                .map((diff) => (
                  <motion.div
                    key={diff.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex flex-col"
                  >
                    {/* Action buttons for current diff */}
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 px-3 h-8 bg-[var(--surface-1)]/60 border-b border-[var(--border)] shrink-0"
                    >
                      <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-[var(--text-dim)]">
                        {diff.path}
                      </span>
                      <span className="text-[var(--border)]">|</span>
                      {diff.author && (
                        <>
                          <span className="font-mono text-[9px] text-[var(--text-ghost)]">
                            by {diff.author}
                          </span>
                          <span className="text-[var(--border)]">|</span>
                        </>
                      )}
                      <div className="flex items-center gap-1.5 ml-auto">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            onReject(diff.id);
                            setExpandedDiffs((prev) => {
                              const next = new Set(prev);
                              next.delete(diff.id);
                              return next;
                            });
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-mono border border-[var(--destructive)]/30 text-[var(--destructive)]/80 hover:bg-[var(--destructive)]/10 transition-colors"
                        >
                          <X className="size-3" />
                          REJEITAR
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            onAccept(diff.id);
                            setExpandedDiffs((prev) => {
                              const next = new Set(prev);
                              next.delete(diff.id);
                              return next;
                            });
                          }}
                          className="flex items-center gap-1 px-3 py-1 rounded text-[10px] font-mono bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90 transition-colors shadow-sm"
                        >
                          <Check className="size-3" />
                          ACEITAR
                        </motion.button>
                      </div>
                    </motion.div>

                    {/* Monaco Diff Editor */}
                    <div className="flex-1 min-h-0">
                      <DiffEditor
                        key={diff.id}
                        theme="forge"
                        language={getLanguageFromPath(diff.path)}
                        original={diff.before}
                        modified={diff.after}
                        onMount={handleDiffMount}
                        options={{
                          fontSize: 13,
                          fontFamily:
                            "'Share Tech Mono', 'Fira Code', 'Consolas', monospace",
                          fontLigatures: true,
                          lineNumbers: "on",
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          wordWrap: "off",
                          padding: { top: 8, bottom: 8 },
                          smoothScrolling: true,
                          bracketPairColorization: { enabled: true },
                          automaticLayout: true,
                          readOnly: true,
                          renderSideBySide: true,
                          originalEditable: false,
                          renderOverviewRuler: true,
                          diffWordWrap: "off",
                          enableSplitViewResizing: false,
                          ignoreTrimWhitespace: false,
                          renderIndicators: true,
                          renderMarginRevertIcon: true,
                          overviewRulerBorder: false,
                          hideCursorInOverviewRuler: true,
                          guides: { indentation: true, bracketPairs: true },
                        } as editor.IDiffEditorConstructionOptions}
                        loading={
                          <div className="h-full grid place-items-center bg-[var(--background)]">
                            <div className="flex flex-col items-center gap-2">
                              <div className="size-6 border-2 border-[var(--primary)]/30 border-t-[var(--primary)] rounded-full animate-spin" />
                              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[var(--text-ghost)]">
                                CARREGANDO DIFF
                              </span>
                            </div>
                          </div>
                        }
                      />
                    </div>
                  </motion.div>
                ))}
            </AnimatePresence>
          ) : (
            <div className="h-full grid place-items-center bg-[var(--background)]">
              <div className="text-center space-y-3">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="size-16 rounded-full bg-[var(--surface-2)] border border-[var(--border)] grid place-items-center mx-auto"
                >
                  <GitCompare className="size-6 text-[var(--text-ghost)]" />
                </motion.div>
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="font-mono text-[9px] tracking-[0.3em] uppercase text-[var(--text-ghost)]"
                >
                  {hasPendingChanges
                    ? "SELECIONE UM ARQUIVO PARA REVISAR"
                    : "SEM MUDANÇAS PENDENTES"}
                </motion.p>
                {hasPendingChanges && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="font-mono text-[10px] text-[var(--text-dim)]"
                  >
                    {pending.length} arquivo{pending.length !== 1 ? "s" : ""} aguardando revisão
                  </motion.p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
