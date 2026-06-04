// GlobalSearch.tsx — Busca global com regex, preview inline e replace
// ⌘⇧F abre overlay. Resultados agrupados por arquivo. Preview de diff.
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, X, FileText, ChevronRight, Replace, ArrowUp, ArrowDown,
  Regex, CaseSensitive, WholeWord, MoreHorizontal, Copy,
} from "lucide-react";

export interface SearchResult {
  filePath: string;
  line: number;
  column: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  files: Array<{ path: string; content: string }>;
  onSelectResult: (filePath: string, line: number, column: number) => void;
  onReplace: (filePath: string, line: number, text: string) => void;
  onReplaceAll: (search: string, replace: string) => void;
}

const spring = {
  type: "spring" as const,
  stiffness: 500,
  damping: 38,
  mass: 0.8,
};

export function GlobalSearch({
  isOpen,
  onClose,
  files,
  onSelectResult,
  onReplace,
  onReplaceAll,
}: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [options, setOptions] = useState({ regex: false, caseSensitive: false, wholeWord: false });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [isOpen]);

  const results = useMemo((): SearchResult[] => {
    if (!query.trim() || query.trim().length < 2) return [];

    const allResults: SearchResult[] = [];

    for (const file of files) {
      if (!file.content) continue;
      const lines = file.content.split("\n");

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        let searchStr = query;
        let lineStr = options.caseSensitive ? line : line.toLowerCase();

        if (!options.caseSensitive) searchStr = searchStr.toLowerCase();

        try {
          const pattern = options.regex ? new RegExp(searchStr, options.caseSensitive ? "g" : "gi") : null;

          if (pattern) {
            let match;
            pattern.lastIndex = 0;
            while ((match = pattern.exec(lineStr)) !== null) {
              allResults.push({
                filePath: file.path,
                line: li + 1,
                column: match.index + 1,
                text: line,
                matchStart: match.index,
                matchEnd: match.index + match[0].length,
              });
              if (!pattern.global) break;
            }
          } else {
            let idx = 0;
            while ((idx = lineStr.indexOf(searchStr, idx)) !== -1) {
              allResults.push({
                filePath: file.path,
                line: li + 1,
                column: idx + 1,
                text: line,
                matchStart: idx,
                matchEnd: idx + searchStr.length,
              });
              idx += searchStr.length;
            }
          }
        } catch {
          // Invalid regex — ignore
        }
      }
    }

    return allResults;
  }, [query, files, options]);

  // Group by file
  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of results) {
      const list = map.get(r.filePath) ?? [];
      list.push(r);
      map.set(r.filePath, list);
    }
    return Array.from(map.entries()).map(([filePath, items]) => ({
      filePath,
      fileName: filePath.split("/").pop() ?? filePath,
      count: items.length,
      items,
    }));
  }, [results]);

  const handleReplaceOne = useCallback(
    (result: SearchResult) => {
      if (!replaceText) return;
      const newLine = result.text.slice(0, result.matchStart) + replaceText + result.text.slice(result.matchEnd);
      onReplace(result.filePath, result.line, newLine);
    },
    [replaceText, onReplace],
  );

  const toggleOption = (key: keyof typeof options) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[var(--background)]/80 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={spring}
            className="fixed top-[10%] left-1/2 -translate-x-1/2 z-[101] w-[700px] max-h-[500px] bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col"
          >
            {/* Search input */}
            <div className="flex items-center gap-2 px-4 h-11 border-b border-[var(--border)] shrink-0">
              <Search className="size-4 text-[var(--text-ghost)] shrink-0" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar em todos os arquivos..."
                className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--text-ghost)] outline-none font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Escape") onClose();
                }}
              />

              {/* Options */}
              <div className="flex items-center gap-0.5">
                {(["regex", "caseSensitive", "wholeWord"] as const).map((opt) => {
                  const labels = { regex: ".*", caseSensitive: "Aa", wholeWord: "ab" };
                  const icons = { regex: <Regex className="size-3" />, caseSensitive: <CaseSensitive className="size-3" />, wholeWord: <WholeWord className="size-3" /> };
                  return (
                    <button
                      key={opt}
                      onClick={() => toggleOption(opt)}
                      className={`p-1.5 rounded transition-colors ${options[opt] ? "bg-[var(--primary)]/15 text-[var(--primary)]" : "text-[var(--text-ghost)] hover:text-[var(--foreground)]"}`}
                      title={labels[opt]}
                    >
                      {icons[opt]}
                    </button>
                  );
                })}
              </div>

              {/* Toggle replace */}
              <button
                onClick={() => setShowReplace(!showReplace)}
                className={`p-1.5 rounded transition-colors ${showReplace ? "bg-[var(--primary)]/15 text-[var(--primary)]" : "text-[var(--text-ghost)] hover:text-[var(--foreground)]"}`}
                title="Substituir"
              >
                <Replace className="size-4" />
              </button>

              <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] transition-colors">
                <X className="size-4" />
              </button>
            </div>

            {/* Replace input */}
            <AnimatePresence>
              {showReplace && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden shrink-0"
                >
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]">
                    <Replace className="size-4 text-[var(--primary)] shrink-0" />
                    <input
                      ref={replaceInputRef}
                      value={replaceText}
                      onChange={(e) => setReplaceText(e.target.value)}
                      placeholder="Substituir por..."
                      className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--text-ghost)] outline-none font-mono"
                    />
                    <button
                      onClick={() => { if (query && replaceText) onReplaceAll(query, replaceText); }}
                      disabled={!query || !replaceText || results.length === 0}
                      className="px-2.5 py-1 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-mono text-[10px] hover:bg-[var(--primary)]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-[var(--primary)]/20"
                    >
                      REPLACE ALL
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {/* Summary */}
              {query.trim().length >= 2 && (
                <div className="px-4 py-1.5 font-mono text-[9px] text-[var(--text-ghost)] border-b border-[var(--border)]">
                  {results.length} resultado{results.length !== 1 ? "s" : ""} em {grouped.length} arquivo{grouped.length !== 1 ? "s" : ""}
                </div>
              )}

              {grouped.length === 0 && query.trim().length >= 2 && (
                <div className="flex flex-col items-center gap-2 py-12 text-[var(--text-ghost)]">
                  <Search className="size-6 opacity-30" />
                  <span className="font-mono text-[9px] tracking-[0.15em] uppercase">Nenhum resultado</span>
                </div>
              )}

              {grouped.length === 0 && query.trim().length < 2 && (
                <div className="flex flex-col items-center gap-2 py-12 text-[var(--text-ghost)]">
                  <Search className="size-6 opacity-30" />
                  <span className="font-mono text-[10px]">Digite pelo menos 2 caracteres</span>
                </div>
              )}

              {/* File groups */}
              {grouped.map((group) => (
                <div key={group.filePath}>
                  <div className="flex items-center gap-2 px-4 py-1.5 font-mono text-[10px] text-[var(--text-dim)]">
                    <FileText className="size-3 text-[var(--primary)]" />
                    <span className="flex-1 truncate">{group.fileName}</span>
                    <span className="text-[var(--text-ghost)]">{group.count}</span>
                  </div>

                  {group.items.map((result, i) => (
                    <button
                      key={`${result.filePath}:${result.line}:${i}`}
                      onClick={() => onSelectResult(result.filePath, result.line, result.column)}
                      className="flex items-start gap-2 w-full px-6 py-1 hover:bg-[var(--surface-2)] transition-colors group text-left"
                    >
                      <span className="font-mono text-[8px] text-[var(--text-ghost)] mt-[1px] shrink-0 select-none w-8 text-right">
                        {result.line}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-[11px]">
                          <span className="text-[var(--text-dim)]">
                            {result.text.slice(0, result.matchStart)}
                          </span>
                          <span className="bg-[var(--primary)]/20 text-[var(--primary)] rounded-sm px-0.5">
                            {result.text.slice(result.matchStart, result.matchEnd)}
                          </span>
                          <span className="text-[var(--text-dim)]">
                            {result.text.slice(result.matchEnd)}
                          </span>
                        </span>
                      </div>
                      {showReplace && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReplaceOne(result); }}
                          className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--primary)]/10 text-[var(--text-ghost)] transition-all"
                          title="Substituir"
                        >
                          <Replace className="size-3" />
                        </button>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
