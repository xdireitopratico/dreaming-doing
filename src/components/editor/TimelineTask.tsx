import type { ForgeTimelineItem } from "@/lib/forge-run";

type TimelineTaskProps = {
  item: Extract<ForgeTimelineItem, { type: "TASK" }>;
};

export function TimelineTask({ item }: TimelineTaskProps) {
  return (
    <div className="forge-timeline-task forge-inspector-timeline-entry" data-testid="timeline-task">
      <span className="forge-timeline-task-label">Task</span>
      <p className="forge-timeline-task-title">{item.label}</p>
    </div>
  );
}