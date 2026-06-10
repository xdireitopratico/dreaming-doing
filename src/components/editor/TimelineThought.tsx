import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ForgeTimelineItem } from "@/lib/forge-run";

type TimelineThoughtProps = {
  item: Extract<ForgeTimelineItem, { type: "THOUGHT" }>;
};

export function TimelineThought({ item }: TimelineThoughtProps) {
  const [open, setOpen] = useState(false);
  const sec = Math.max(1, Math.round(item.durationMs / 1000));

  return (
    <div className="forge-timeline-thought border-b border-[var(--border-forge)]/50 py-2" data-testid="timeline-thought">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-[length:var(--font-task-label)] uppercase tracking-wider text-[var(--status-thinking)] font-mono">
          Thought
        </span>
        <span className="text-xs text-[var(--text-muted)] font-mono">for {sec}s</span>
        {item.active && <Loader2 className="size-3 animate-spin text-[var(--status-thinking)]" />}
        <ChevronDown className={cn("ml-auto size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && item.text && (
        <p className="mt-1 text-sm text-[var(--text-secondary)] whitespace-pre-wrap pl-1">
          {item.text}
        </p>
      )}
    </div>
  );
}