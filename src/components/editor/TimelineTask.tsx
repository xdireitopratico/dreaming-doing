import type { ForgeTimelineItem } from "@/lib/forge-run";

type TimelineTaskProps = {
  item: Extract<ForgeTimelineItem, { type: "TASK" }>;
};

export function TimelineTask({ item }: TimelineTaskProps) {
  return (
    <div className="forge-timeline-task py-2" data-testid="timeline-task">
      <span className="text-[length:var(--font-task-label)] uppercase tracking-wider text-[var(--text-muted)] font-mono">
        Task
      </span>
      <p className="text-[length:var(--font-task-body)] text-[var(--text-primary)] mt-0.5">
        {item.label}
      </p>
    </div>
  );
}