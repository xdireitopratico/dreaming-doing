import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ForgeTimelineItem } from "@/lib/forge-run";
import {
  buildInspectorDetailBlocks,
  lastThoughtBlockId,
  type InspectorDetailBlock,
} from "@/lib/inspector-details";

type InspectorActivityFeedProps = {
  items: ForgeTimelineItem[];
  onOpenFile?: (path: string) => void;
  running?: boolean;
};

function ThoughtBlock({
  block,
  defaultOpen,
}: {
  block: Extract<InspectorDetailBlock, { kind: "thought" }>;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || !!block.active);
  const sec = Math.max(1, Math.round(block.durationMs / 1000));

  useEffect(() => {
    if (block.active) setOpen(true);
  }, [block.active, block.text]);

  return (
    <div className="forge-details-thought" data-testid="timeline-thought">
      <button
        type="button"
        className="forge-details-thought-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="forge-details-thought-label">Thought for {sec}s</span>
        {block.active && (
          <Loader2 className="size-3 animate-spin" style={{ color: "var(--text-accent)" }} />
        )}
        <ChevronDown
          className={cn("forge-details-chevron size-3.5", open && "forge-details-chevron--open")}
        />
      </button>
      {(open || block.active) && block.text && (
        <p className="forge-details-thought-body">{block.text}</p>
      )}
    </div>
  );
}

function ActionRow({
  block,
  onOpenFile,
}: {
  block: Extract<InspectorDetailBlock, { kind: "action" }>;
  onOpenFile?: (path: string) => void;
}) {
  const clickable = !!block.path && !!onOpenFile;
  return (
    <div className="forge-details-action" data-testid="timeline-action">
      {clickable ? (
        <button
          type="button"
          className="forge-details-action-btn"
          onClick={() => onOpenFile!(block.path!)}
        >
          {block.emoji && <span className="forge-details-action-emoji">{block.emoji}</span>}
          {block.label}
        </button>
      ) : (
        <span className="forge-details-action-label">
          {block.emoji && <span className="forge-details-action-emoji">{block.emoji}</span>}
          {block.label}
        </span>
      )}
    </div>
  );
}

function CodeBlock({ block }: { block: Extract<InspectorDetailBlock, { kind: "code" }> }) {
  return (
    <pre className="forge-details-code" data-testid="timeline-code">
      <code>{block.code}</code>
    </pre>
  );
}

function SectionBlock({ block }: { block: Extract<InspectorDetailBlock, { kind: "section" }> }) {
  return (
    <div className="forge-details-section" data-testid="timeline-section">
      <p className="forge-details-section-title">{block.title}</p>
      {block.body && <p className="forge-details-section-body">{block.body}</p>}
    </div>
  );
}

export function InspectorActivityFeed({
  items,
  onOpenFile,
}: InspectorActivityFeedProps) {
  const blocks = useMemo(() => buildInspectorDetailBlocks(items), [items]);
  const lastThoughtId = useMemo(() => lastThoughtBlockId(blocks), [blocks]);

  if (!blocks.length) return null;

  return (
    <div className="forge-inspector-timeline-track" data-testid="inspector-timeline-track">
      {blocks.map((block) => {
        switch (block.kind) {
          case "thought":
            return (
              <div key={block.id} className="forge-inspector-timeline-entry">
                <ThoughtBlock block={block} defaultOpen={block.id === lastThoughtId} />
              </div>
            );
          case "action":
            return (
              <div key={block.id} className="forge-inspector-timeline-entry">
                <ActionRow block={block} onOpenFile={onOpenFile} />
              </div>
            );
          case "code":
            return (
              <div key={block.id} className="forge-inspector-timeline-entry">
                <CodeBlock block={block} />
              </div>
            );
          case "section":
            return (
              <div key={block.id} className="forge-inspector-timeline-entry">
                <SectionBlock block={block} />
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

