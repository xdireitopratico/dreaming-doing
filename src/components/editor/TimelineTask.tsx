import type { ForgeTimelineItem } from "@/lib/forge-run";

type TimelineTaskProps = {
  item: Extract<ForgeTimelineItem, { type: "TASK" }>;
};

export function TimelineTask({ item }: TimelineTaskProps) {
  return (
    <div className="lovable-task-bubble forge-inspector-timeline-entry" data-testid="timeline-task">
      <span className="lovable-task-bubble-label">Task</span>
      <p className="lovable-task-bubble-title">{item.label}</p>
    </div>
  );
}