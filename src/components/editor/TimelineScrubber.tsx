// TimelineScrubber.tsx — Horizontal timeline scrubber for agent changes
// Visual timeline with dots, tool count badges, hover previews
import { useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  GitCommit, CheckCircle2, AlertCircle, Loader2, ChevronRight,
} from "lucide-react";

export interface TimelineItem {
  id: string;
  timestamp: number;
  label: string;
  toolCount: number;
  okCount: number;
  errorCount: number;
  runningCount: number;
}

interface TimelineScrubberProps {
  items: TimelineItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const spring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 34,
};

export function TimelineScrubber({ items, selectedId, onSelect }: TimelineScrubberProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedRef.current && listRef.current) {
      const container = listRef.current;
      const el = selectedRef.current;
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();

      if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [selectedId]);

  if (items.length === 0) {
    return (
      <div className="flex-1 grid place-items-center p-4">
        <p className="font-mono text-[9px] tracking-[0.15em] uppercase text-[var(--text-ghost)] text-center">
          NENHUMA MENSAGEM
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[var(--border)]">
        <span className="font-mono text-[8px] tracking-[0.25em] uppercase text-[var(--text-ghost)]">
          LINHA DO TEMPO
        </span>
      </div>

      {/* Timeline list */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-2">
        <div className="relative ml-5">
          {/* Vertical line */}
          <div className="absolute left-[5px] top-0 bottom-0 w-px bg-[var(--border)]" />

          {items.map((item, i) => {
            const isSelected = item.id === selectedId;
            const allOk = item.okCount === item.toolCount && item.toolCount > 0;
            const hasErrors = item.errorCount > 0;

            return (
              <motion.button
                key={item.id}
                ref={isSelected ? selectedRef : undefined}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring, delay: i * 0.03 }}
                onClick={() => onSelect(item.id)}
                className={`relative w-full text-left pl-6 pr-3 py-2.5 group transition-colors ${
                  isSelected
                    ? "bg-[var(--primary)]/10"
                    : "hover:bg-[var(--surface-2)]"
                }`}
              >
                {/* Dot on the timeline */}
                <div
                  className={`absolute left-[2.5px] top-4 size-2 rounded-full border-2 transition-colors -translate-x-1/2 ${
                    isSelected
                      ? "border-[var(--primary)] bg-[var(--primary)] shadow-lg shadow-[var(--primary)]/30"
                      : allOk
                        ? "border-emerald-400 bg-[var(--surface-1)] group-hover:border-[var(--primary)]"
                        : hasErrors
                          ? "border-[var(--destructive)] bg-[var(--surface-1)] group-hover:border-[var(--primary)]"
                          : "border-[var(--border)] bg-[var(--surface-1)] group-hover:border-[var(--primary)]"
                  }`}
                />

                {/* Content */}
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] text-[var(--foreground)] truncate group-hover:text-[var(--primary)] transition-colors">
                      {item.label}
                    </div>
                    <div className="font-mono text-[8px] text-[var(--text-ghost)] mt-0.5">
                      {new Date(item.timestamp).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1 shrink-0">
                    {item.okCount > 0 && (
                      <span className="flex items-center gap-0.5 font-mono text-[8px] text-emerald-400">
                        <CheckCircle2 className="size-2.5" />
                        {item.okCount}
                      </span>
                    )}
                    {item.errorCount > 0 && (
                      <span className="flex items-center gap-0.5 font-mono text-[8px] text-[var(--destructive)]">
                        <AlertCircle className="size-2.5" />
                        {item.errorCount}
                      </span>
                    )}
                    {item.runningCount > 0 && (
                      <span className="flex items-center gap-0.5 font-mono text-[8px] text-[var(--text-ghost)]">
                        <Loader2 className="size-2.5 animate-spin" />
                        {item.runningCount}
                      </span>
                    )}
                    {isSelected && (
                      <ChevronRight className="size-3 text-[var(--primary)]" />
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[var(--border)]">
        <span className="font-mono text-[8px] text-[var(--text-ghost)]">
          {items.length} evento{items.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
