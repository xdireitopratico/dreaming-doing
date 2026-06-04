// MessageDiffCard.tsx — Card expansível mostrando diff de cada tool call
// Exibe antes/depois do arquivo, metadados do tool, status visual
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileCode, ChevronDown, ChevronUp, CheckCircle2, AlertCircle,
  Loader2, Clock, ArrowRight, FilePlus, FilePen, Copy,
} from "lucide-react";

interface ToolCall {
  id: string; name: string; args: Record<string, unknown>;
  status: "running" | "ok" | "error"; error?: string;
  created_at: string;
}

interface MessageDiffCardProps {
  tool: ToolCall;
  fileMap: Map<string, { content: string; updated_at: string }>;
}

const spring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 34,
};

export function MessageDiffCard({ tool, fileMap }: MessageDiffCardProps) {
  const [expanded, setExpanded] = useState(false);
  const path = (tool.args.path as string) ?? "";
  const isWrite = tool.name === "fs_write";
  const isEdit = tool.name === "fs_edit";

  const currentFile = fileMap.get(path);
  const agentContent = (tool.args.content as string) ?? "";

  // For edits, compute diff lines
  const diffLines = useMemo(() => {
    if (isEdit) {
      const existing = currentFile?.content ?? "";
      const existingLines = existing.split("\n");
      const newLines = agentContent.split("\n");
      const editLine = (tool.args.line as number) ?? 1;
      const editCount = (tool.args.lines as number) ?? 1;

      const result = [];
      for (let i = 0; i < Math.max(existingLines.length, editLine - 1 + editCount); i++) {
        const isInEditRange = i >= editLine - 1 && i < editLine - 1 + editCount;
        const existing = existingLines[i] ?? "";
        const replacement = newLines[i - (editLine - 1)] ?? "";
        result.push({ lineNum: i + 1, before: existing, after: isInEditRange ? replacement : existing });
      }
      return result;
    }
    return null;
  }, [isEdit, currentFile, agentContent, tool.args]);

  const fileName = path.split("/").pop() ?? path;
  const icon = isWrite ? (
    <FilePlus className="size-3.5 text-emerald-400" />
  ) : isEdit ? (
    <FilePen className="size-3.5 text-blue-400" />
  ) : (
    <FileCode className="size-3.5 text-[var(--text-dim)]" />
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="border border-[var(--border)] rounded-lg bg-[var(--surface-1)]/40 overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-2)]/50 transition-colors"
      >
        {/* Status */}
        <div className="shrink-0">
          {tool.status === "ok" ? (
            <CheckCircle2 className="size-4 text-emerald-400" />
          ) : tool.status === "error" ? (
            <AlertCircle className="size-4 text-[var(--destructive)]" />
          ) : (
            <Loader2 className="size-4 text-[var(--text-ghost)] animate-spin" />
          )}
        </div>

        {/* Tool info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-mono text-[11px] text-[var(--foreground)]">{tool.name}</span>
            <span className="font-mono text-[9px] text-[var(--primary)]/70 truncate">{fileName}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 font-mono text-[9px] text-[var(--text-ghost)]">
              <Clock className="size-2.5" />
              {new Date(tool.created_at).toLocaleTimeString("pt-BR")}
            </span>
            {isEdit && (
              <span className="font-mono text-[9px] text-[var(--text-ghost)]">
                linha {(tool.args.line as number) ?? "?"}
              </span>
            )}
          </div>
        </div>

        {/* Error badge */}
        {tool.status === "error" && tool.error && (
          <span className="font-mono text-[9px] text-[var(--destructive)] px-2 py-0.5 rounded bg-[var(--destructive)]/10 shrink-0 max-w-[120px] truncate">
            {tool.error}
          </span>
        )}

        {/* Expand icon */}
        <span className="text-[var(--text-ghost)]">
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </span>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border)]">
              {/* File info bar */}
              <div className="flex items-center gap-2 px-4 py-2 bg-[var(--surface-2)]/40 border-b border-[var(--border)]">
                <FileCode className="size-3 text-[var(--text-ghost)]" />
                <span className="font-mono text-[10px] text-[var(--text-dim)]">{path}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(agentContent);
                  }}
                  className="ml-auto p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] transition-colors"
                  title="Copiar conteúdo"
                >
                  <Copy className="size-3" />
                </button>
              </div>

              {/* Diff content */}
              {isWrite ? (
                <div className="p-4">
                  {/* New file indicator */}
                  {!currentFile && (
                    <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded bg-emerald-400/10 border border-emerald-400/20">
                      <FilePlus className="size-3 text-emerald-400" />
                      <span className="font-mono text-[9px] text-emerald-400">
                        ARQUIVO NOVO
                      </span>
                    </div>
                  )}
                  <pre className="font-mono text-[11px] leading-relaxed text-[var(--text-dim)] whitespace-pre-wrap bg-[var(--background)] p-3 rounded border border-[var(--border)] max-h-[400px] overflow-auto">
                    {agentContent}
                  </pre>
                </div>
              ) : isEdit && diffLines ? (
                <div className="p-4">
                  <pre className="font-mono text-[11px] leading-relaxed bg-[var(--background)] p-3 rounded border border-[var(--border)] max-h-[400px] overflow-auto">
                    {diffLines.map((line, i) => {
                      const changed = line.before !== line.after;
                      return (
                        <div
                          key={i}
                          className={`flex ${changed ? "bg-[var(--primary)]/5" : ""}`}
                        >
                          <span className="w-8 shrink-0 text-right pr-3 select-none text-[9px] text-[var(--text-ghost)]">
                            {line.lineNum}
                          </span>
                          {changed ? (
                            <>
                              <span className="w-full/2 text-[var(--destructive)] bg-[var(--destructive)]/5 pr-2">
                                {line.before}
                              </span>
                              <span className="w-2 text-[var(--text-ghost)] shrink-0 text-center">
                                <ArrowRight className="size-3 inline" />
                              </span>
                              <span className="w-full/2 text-emerald-400 bg-emerald-400/5 pl-2">
                                {line.after}
                              </span>
                            </>
                          ) : (
                            <span className="text-[var(--text-dim)]">{line.before}</span>
                          )}
                        </div>
                      );
                    })}
                  </pre>
                </div>
              ) : (
                <div className="p-4">
                  <div className="font-mono text-[11px] text-[var(--text-dim)] whitespace-pre-wrap bg-[var(--background)] p-3 rounded border border-[var(--border)] max-h-[400px] overflow-auto">
                    {JSON.stringify(tool.args, null, 2)}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
