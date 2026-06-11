import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ForgeTimelineItem } from "@/lib/forge-run";

type TimelineThoughtProps = {
  item: Extract<ForgeTimelineItem, { type: "THOUGHT" }>;
};

export function TimelineThought({ item }: TimelineThoughtProps) {
  const [open, setOpen] = useState(item.active);
  const sec = Math.max(1, Math.round(item.durationMs / 1000));

  useEffect(() => {
    if (item.active) setOpen(true);
  }, [item.active, item.text]);

  return (
    <div
      className="forge-timeline-thought forge-inspector-timeline-entry"
      data-testid="timeline-thought"
    >
      <button
        type="button"
        className="forge-timeline-thought-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="forge-timeline-thought-label">Thought for {sec}s</span>
        {item.active && (
          <Loader2 className="size-3 animate-spin" style={{ color: "var(--text-accent)" }} />
        )}
        <ChevronDown
          className={cn(
            "forge-timeline-thought-chevron size-3.5",
            open && "forge-timeline-thought-chevron--open",
          )}
        />
      </button>
      {(open || item.active) && item.text && (
        <p className="forge-timeline-thought-prose">{item.text}</p>
      )}
    </div>
  );
}
