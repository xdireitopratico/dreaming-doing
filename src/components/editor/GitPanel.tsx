// GitPanel.tsx — Sidebar de git nível VS Code
// Arquivos modificados com indicadores M/A/D, stage/unstage, commit, push/pull
// Tudo via Supabase — sem git real no browser
import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch, ArrowUp, ArrowDown, Plus, Minus, Check, X,
  GitCommit, RefreshCw, FileText, ChevronRight, ChevronDown,
  Circle, MoreHorizontal, Square, CheckSquare,
} from "lucide-react";

export interface GitFileStatus {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "conflict";
  oldPath?: string;
  additions: number;
  deletions: number;
  staged: boolean;
}

interface GitPanelProps {
  branch: string;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onCommit: (message: string) => void;
  onPush: () => void;
  onPull: () => void;
  onOpenFile: (path: string) => void;
  /** Recent commits */
  commits?: Array<{ hash: string; message: string; timestamp: number }>;
}

const spring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 34,
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  modified: { label: "M", color: "text-amber-400", bg: "bg-amber-400/10" },
  added: { label: "A", color: "text-emerald-400", bg: "bg-emerald-400/10" },
  deleted: { label: "D", color: "text-[var(--destructive)]", bg: "bg-[var(--destructive)]/10" },
  renamed: { label: "R", color: "text-blue-400", bg: "bg-blue-400/10" },
  conflict: { label: "!", color: "text-[var(--destructive)]", bg: "bg-[var(--destructive)]/15 animate-pulse" },
};

export function GitPanel({
  branch,
  ahead,
  behind,
  files,
  onStage,
  onUnstage,
  onStageAll,
  onUnstageAll,
  onCommit,
  onPush,
  onPull,
  onOpenFile,
  commits = [],
}: GitPanelProps) {
  const [message, setMessage] = useState("");
  const [showCommits, setShowCommits] = useState(false);

  const stagedCount = files.filter((f) => f.staged).length;
  const changedCount = files.length;

  const handleCommit = useCallback(() => {
    if (!message.trim() || stagedCount === 0) return;
    onCommit(message.trim());
    setMessage("");
  }, [message, stagedCount, onCommit]);

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-1.5">
          <GitBranch className="size-3 text-[var(--primary)]" />
          <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-[var(--foreground)]">
            Git
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onPull}
            disabled={behind === 0}
            className={`p-1 rounded transition-colors ${behind > 0 ? "text-[var(--primary)] hover:bg-[var(--primary)]/10" : "text-[var(--text-ghost)]"}`}
            title="Pull"
          >
            <ArrowDown className="size-3" />
          </button>
          <button
            onClick={onPush}
            disabled={ahead === 0}
            className={`p-1 rounded transition-colors ${ahead > 0 ? "text-[var(--primary)] hover:bg-[var(--primary)]/10" : "text-[var(--text-ghost)]"}`}
            title="Push"
          >
            <ArrowUp className="size-3" />
          </button>
          <button
            onClick={onStageAll}
            className="p-1 rounded text-[var(--text-ghost)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors"
            title="Stage All"
          >
            <CheckSquare className="size-3" />
          </button>
        </div>
      </div>

      {/* Branch + stats */}
      <div className="px-3 py-2 border-b border-[var(--border)] space-y-1.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <GitBranch className="size-3 text-[var(--text-dim)]" />
          <span className="font-mono text-[11px] text-[var(--foreground)]">{branch}</span>
          {ahead > 0 && (
            <span className="font-mono text-[9px] text-[var(--primary)]">↑{ahead}</span>
          )}
          {behind > 0 && (
            <span className="font-mono text-[9px] text-[var(--text-dim)]">↓{behind}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[9px] font-mono text-[var(--text-ghost)]">
          <span>{changedCount} mudança{changedCount !== 1 ? "s" : ""}</span>
          <span className="text-[var(--border)]">·</span>
          <span>{stagedCount} staged</span>
        </div>
      </div>

      {/* Staged changes */}
      {files.filter((f) => f.staged).length > 0 && (
        <div className="shrink-0">
          <div className="flex items-center gap-1 px-3 py-1.5 font-mono text-[8px] tracking-[0.2em] uppercase text-[var(--text-ghost)]">
            <ChevronDown className="size-3" />
            Staged
          </div>
          <div className="space-y-px">
            {files
              .filter((f) => f.staged)
              .map((file) => (
                <FileRow
                  key={file.path}
                  file={file}
                  onClick={() => onOpenFile(file.path)}
                  onToggle={() => onUnstage(file.path)}
                  staged
                />
              ))}
          </div>
        </div>
      )}

      {/* Unstaged changes */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex items-center gap-1 px-3 py-1.5 font-mono text-[8px] tracking-[0.2em] uppercase text-[var(--text-ghost)]">
          <ChevronDown className="size-3" />
          Changes
        </div>
        <div className="space-y-px">
          {files
            .filter((f) => !f.staged)
            .map((file) => (
              <FileRow
                key={file.path}
                file={file}
                onClick={() => onOpenFile(file.path)}
                onToggle={() => onStage(file.path)}
                staged={false}
              />
            ))}
          {files.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-[var(--text-ghost)]">
              <Check className="size-5 opacity-30" />
              <span className="font-mono text-[9px] tracking-[0.1em] uppercase">
                Nenhuma mudança
              </span>
            </div>
          )}
        </div>

        {/* Commit history toggle */}
        <div className="mt-2">
          <button
            onClick={() => setShowCommits(!showCommits)}
            className="flex items-center gap-1.5 w-full px-3 py-1.5 font-mono text-[8px] tracking-[0.15em] uppercase text-[var(--text-ghost)] hover:text-[var(--foreground)] transition-colors"
          >
            {showCommits ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Histórico ({commits.length})
          </button>

          <AnimatePresence>
            {showCommits && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-px">
                  {commits.map((c) => (
                    <div
                      key={c.hash}
                      className="flex items-start gap-2 px-5 py-1.5 hover:bg-[var(--surface-2)]/50 transition-colors cursor-default"
                    >
                      <GitCommit className="size-3 text-[var(--text-ghost)] mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-[10px] text-[var(--foreground)] truncate">
                          {c.message}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[8px] text-[var(--text-ghost)]">
                            {c.hash.slice(0, 7)}
                          </span>
                          <span className="font-mono text-[8px] text-[var(--text-ghost)]">
                            {new Date(c.timestamp).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Commit input */}
      <div className="border-t border-[var(--border)] p-2 shrink-0 space-y-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleCommit();
            }
          }}
          placeholder="Mensagem de commit... (⌘↵ para confirmar)"
          rows={2}
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-[10px] font-mono text-[var(--foreground)] placeholder:text-[var(--text-ghost)] outline-none focus:border-[var(--primary)]/40 resize-none transition-colors"
        />
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCommit}
            disabled={!message.trim() || stagedCount === 0}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-mono text-[9px] tracking-[0.1em] uppercase hover:bg-[var(--primary)]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-[var(--primary)]/20"
          >
            <GitCommit className="size-3" />
            Commit
          </button>
          <button
            onClick={onPush}
            disabled={ahead === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-dim)] font-mono text-[9px] hover:text-[var(--foreground)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowUp className="size-3" />
            Push
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// File Row
// ---------------------------------------------------------------------------

function FileRow({
  file,
  onClick,
  onToggle,
  staged,
}: {
  file: GitFileStatus;
  onClick: () => void;
  onToggle: () => void;
  staged: boolean;
}) {
  const cfg = statusConfig[file.status] ?? statusConfig.modified;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-[var(--surface-2)]/50 transition-colors group">
      {/* Stage toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`p-0.5 rounded transition-colors ${staged ? "text-[var(--primary)]" : "text-[var(--text-ghost)] opacity-0 group-hover:opacity-100"}`}
      >
        {staged ? <Minus className="size-3" /> : <Plus className="size-3" />}
      </button>

      {/* Status badge */}
      <span className={`flex items-center justify-center w-5 h-4 rounded font-mono text-[8px] font-bold ${cfg.color} ${cfg.bg}`}>
        {cfg.label}
      </span>

      {/* File name */}
      <button onClick={onClick} className="flex-1 text-left min-w-0">
        <span className="font-mono text-[10px] text-[var(--foreground)] truncate block">
          {file.path.split("/").pop()}
        </span>
        <span className="font-mono text-[8px] text-[var(--text-ghost)] truncate block">
          {file.path}
        </span>
      </button>

      {/* Additions/deletions */}
      <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {file.additions > 0 && (
          <span className="font-mono text-[8px] text-emerald-400">+{file.additions}</span>
        )}
        {file.deletions > 0 && (
          <span className="font-mono text-[8px] text-[var(--destructive)]">-{file.deletions}</span>
        )}
      </div>
    </div>
  );
}
