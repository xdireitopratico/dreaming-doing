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
    <div className="forge-timeline-tool forge-inspector-timeline-entry" data-testid="timeline-tool">
      <button
        type="button"
        className="forge-timeline-tool-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="forge-timeline-tool-badge">Tool</span>
        <span className="forge-timeline-tool-name">{label}</span>
        <ChevronDown className={cn("ml-auto size-3.5 shrink-0 opacity-60", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 w-full">
          {item.path && onOpenFile && (
            <button type="button" className="forge-timeline-tool-link" onClick={() => onOpenFile(item.path!)}>
              Abrir {item.path}
            </button>
          )}
          {item.detail && <pre className="forge-timeline-tool-detail mt-1">{item.detail}</pre>}
        </div>
      )}
    </div>
  );
}