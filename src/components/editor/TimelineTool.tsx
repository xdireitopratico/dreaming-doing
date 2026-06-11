import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ForgeTimelineItem } from "@/lib/forge-run";

type TimelineToolProps = {
  item: Extract<ForgeTimelineItem, { type: "TOOL" }>;
  onOpenFile?: (path: string) => void;
};

function toolHeadline(item: Extract<ForgeTimelineItem, { type: "TOOL" }>): string {
  if (item.path) {
    const file = item.path.split("/").pop() ?? item.path;
    const isEdit = /write|edit|patch|create/i.test(item.name);
    return isEdit ? `Edited  ${file}` : `${item.name}  ${item.path}`;
  }
  return item.name;
}

export function TimelineTool({ item, onOpenFile }: TimelineToolProps) {
  const [open, setOpen] = useState(false);
  const headline = toolHeadline(item);

  return (
    <div className="forge-timeline-tool forge-inspector-timeline-entry" data-testid="timeline-tool">
      <button
        type="button"
        className="forge-timeline-tool-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="forge-timeline-tool-headline">{headline}</span>
        <ChevronDown
          className={cn(
            "forge-timeline-tool-chevron size-3.5",
            open && "forge-timeline-tool-chevron--open",
          )}
        />
      </button>
      {open && (
        <div className="forge-timeline-tool-body">
          {item.path && onOpenFile && (
            <button
              type="button"
              className="forge-timeline-tool-link"
              onClick={() => onOpenFile(item.path!)}
            >
              Abrir {item.path}
            </button>
          )}
          {item.detail && <pre className="forge-timeline-tool-detail">{item.detail}</pre>}
        </div>
      )}
    </div>
  );
}
