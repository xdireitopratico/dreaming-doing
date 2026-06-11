import type { ForgeTimelineItem } from "@/lib/forge-run";
import { TimelineTask } from "@/components/editor/TimelineTask";
import { TimelineThought } from "@/components/editor/TimelineThought";
import { TimelineTool } from "@/components/editor/TimelineTool";
import { TimelineResult } from "@/components/editor/TimelineResult";

type TimelineItemProps = {
  item: ForgeTimelineItem;
  onOpenFile?: (path: string) => void;
};

export function TimelineItem({ item, onOpenFile }: TimelineItemProps) {
  switch (item.type) {
    case "TASK":
      return <TimelineTask item={item} />;
    case "THOUGHT":
      return <TimelineThought item={item} />;
    case "TOOL":
      return <TimelineTool item={item} onOpenFile={onOpenFile} />;
    case "RESULT":
      return <TimelineResult item={item} />;
    default:
      return null;
  }
}
