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
    <div className="lovable-thought-block forge-inspector-timeline-entry" data-testid="timeline-thought">
      <button
        type="button"
        className="lovable-thought-block-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="lovable-thought-block-label">Thought for {sec}s</span>
        {item.active && <Loader2 className="size-3 animate-spin text-[var(--forge-primary)]" />}
        <ChevronDown
          className={cn(
            "lovable-thought-block-chevron size-3.5",
            open && "lovable-thought-block-chevron--open",
          )}
        />
      </button>
      {open && item.text && <p className="lovable-thought-block-prose">{item.text}</p>}
    </div>
  );
}