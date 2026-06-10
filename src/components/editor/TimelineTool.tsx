import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ForgeTimelineItem } from "@/lib/forge-run";

type TimelineToolProps = {
  item: Extract<ForgeTimelineItem, { type: "TOOL" }>;
  onOpenFile?: (path: string) => void;
};

export function TimelineTool({ item, onOpenFile }: TimelineToolProps) {
  const [open, setOpen] = useState(false);
  const label = item.path ? `${item.name}  ${item.path}` : item.name;

  return (
    <div className="forge-timeline-tool border-b border-[var(--border-forge)]/50 py-2" data-testid="timeline-tool">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-[length:var(--font-task-label)] uppercase tracking-wider text-[var(--status-working)] font-mono">
          Tool
        </span>
        <span className="text-[length:var(--font-tool)] text-[var(--text-secondary)] font-mono truncate">
          {label}
        </span>
        <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1 pl-1">
          {item.path && onOpenFile && (
            <button
              type="button"
              className="text-[10px] font-mono text-[var(--status-working)] hover:underline"
              onClick={() => onOpenFile(item.path!)}
            >
              Abrir {item.path}
            </button>
          )}
          {item.detail && (
            <pre className="mt-1 text-[10px] font-mono text-[var(--text-muted)] whitespace-pre-wrap">
              {item.detail}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}