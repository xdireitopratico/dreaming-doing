import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineEntry } from "@/lib/timeline-builder";

type InspectorActivityFeedProps = {
  items: TimelineEntry[];
  onOpenFile?: (path: string) => void;
  running?: boolean;
};

function ThoughtBlock({
  entry,
  defaultOpen,
}: {
  entry: TimelineEntry;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!entry.active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [entry.active]);

  const durationMs = entry.durationMs ?? 1000;
  const sec = Math.max(1, Math.round(durationMs / 1000));

  useEffect(() => {
    if (entry.active) setOpen(true);
  }, [entry.active, entry.detail]);

  return (
    <div className="forge-details-thought" data-testid="timeline-thought">
      <button
        type="button"
        className="forge-details-thought-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="forge-details-thought-label">{entry.label}</span>
        {entry.active && (
          <Loader2 className="size-3 animate-spin" style={{ color: "var(--text-accent)" }} />
        )}
        <ChevronDown
          className={cn("forge-details-chevron size-3.5", open && "forge-details-chevron--open")}
        />
      </button>
      {(open || entry.active) && entry.detail && (
        <p className="forge-details-thought-body">{entry.detail}</p>
      )}
    </div>
  );
}

function ToolBlock({
  entry,
  onOpenFile,
}: {
  entry: TimelineEntry;
  onOpenFile?: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const clickable = !!entry.path && !!onOpenFile;

  return (
    <div className="forge-timeline-tool" data-testid="timeline-tool">
      <button
        type="button"
        className="forge-timeline-tool-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {entry.emoji && <span className="forge-details-action-emoji">{entry.emoji}</span>}
        <span className="forge-timeline-tool-headline">{entry.label}</span>
        <ChevronDown
          className={cn("forge-timeline-tool-chevron size-3.5", open && "forge-timeline-tool-chevron--open")}
        />
      </button>
      {open && (
        <div className="forge-timeline-tool-body">
          {clickable && (
            <button
              type="button"
              className="forge-timeline-tool-link"
              onClick={() => onOpenFile!(entry.path!)}
            >
              Abrir {entry.path}
            </button>
          )}
          {entry.detail && <pre className="forge-timeline-tool-detail">{entry.detail}</pre>}
        </div>
      )}
    </div>
  );
}

function ResultBlock({ entry }: { entry: TimelineEntry }) {
  const isFail = entry.ok === false;
  return (
    <div
      className={cn("forge-timeline-result", isFail && "forge-timeline-result--failed")}
      data-testid="timeline-result"
    >
      <span className="forge-timeline-result-label">{entry.label}</span>
    </div>
  );
}

function PhaseBlock({ entry }: { entry: TimelineEntry }) {
  return (
    <div className="forge-timeline-phase" data-testid="timeline-phase">
      {entry.emoji && <span className="forge-details-action-emoji">{entry.emoji}</span>}
      <span className="forge-timeline-phase-label">{entry.label}</span>
    </div>
  );
}

function CheckpointBlock({ entry }: { entry: TimelineEntry }) {
  const [open, setOpen] = useState(false);
  const evidence = entry.evidence ?? [];

  return (
    <div className="forge-timeline-checkpoint" data-testid="timeline-checkpoint">
      <button
        type="button"
        className="forge-timeline-checkpoint-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="forge-timeline-checkpoint-label">{entry.label}</span>
        {evidence.length > 0 && (
          <ChevronDown
            className={cn("forge-timeline-checkpoint-chevron size-3.5", open && "forge-timeline-checkpoint-chevron--open")}
          />
        )}
      </button>
      {open && evidence.length > 0 && (
        <div className="forge-timeline-checkpoint-files">
          {evidence.map((f, i) => (
            <span key={f} className="forge-timeline-checkpoint-file">
              {i === evidence.length - 1 ? "└──" : "├──"} {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const KIND_CLASS: Record<string, string> = {
  thought: "forge-timeline-entry--thought",
  tool: "forge-timeline-entry--tool",
  result: "forge-timeline-entry--result",
  phase: "forge-timeline-entry--phase",
  checkpoint: "forge-timeline-entry--checkpoint",
};

export function InspectorActivityFeed({
  items,
  onOpenFile,
}: InspectorActivityFeedProps) {
  if (!items.length) return null;

  const lastThoughtId = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i]?.kind === "thought") return items[i]!.id;
    }
    return null;
  }, [items]);

  return (
    <div className="forge-inspector-timeline-track" data-testid="inspector-timeline-track">
      {items.map((entry) => {
        const kindClass = KIND_CLASS[entry.kind] ?? "";
        const failClass = entry.kind === "result" && entry.ok === false ? "forge-timeline-entry--failed" : "";
        return (
          <div key={entry.id} className={cn("forge-inspector-timeline-entry", kindClass, failClass)}>
            {entry.kind === "thought" && (
              <ThoughtBlock entry={entry} defaultOpen={entry.id === lastThoughtId} />
            )}
            {entry.kind === "tool" && <ToolBlock entry={entry} onOpenFile={onOpenFile} />}
            {entry.kind === "result" && <ResultBlock entry={entry} />}
            {entry.kind === "phase" && <PhaseBlock entry={entry} />}
            {entry.kind === "checkpoint" && <CheckpointBlock entry={entry} />}
          </div>
        );
      })}
    </div>
  );
}
