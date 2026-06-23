import { useState, type ComponentType, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Database,
  FileText,
  GitCompare,
  Lightbulb,
  Loader2,
  MessageSquare,
  Search,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineEntry } from "@/lib/timeline-builder";

type InspectorActivityFeedProps = {
  items: TimelineEntry[];
  onOpenFile?: (path: string) => void;
  running?: boolean;
};

type TimelineIcon = ComponentType<{ className?: string }>;

function iconForEntry(entry: TimelineEntry): TimelineIcon {
  if (entry.kind === "thought") return Lightbulb;
  if (entry.kind === "briefing") return MessageSquare;
  if (entry.kind === "diff") return GitCompare;
  if (entry.kind === "closure") return entry.canceled ? XCircle : CheckCircle2;
  if (entry.kind === "checkpoint") return FileText;
  if (entry.kind === "result") return entry.ok === false ? XCircle : CheckCircle2;
  if (entry.kind === "tool") {
    if (/command|shell|terminal|executing/i.test(entry.label)) return TerminalSquare;
    if (/search|pesquisando/i.test(entry.label)) return Search;
    if (/database/i.test(entry.label)) return Database;
    return FileText;
  }
  return CircleDashed;
}

function TimelineShell({ entry, children }: { entry: TimelineEntry; children: ReactNode }) {
  const Icon = iconForEntry(entry);
  return (
    <div
      className={cn(
        "forge-inspector-timeline-entry",
        `forge-timeline-entry--${entry.kind}`,
        entry.kind === "result" && entry.ok === false && "forge-timeline-entry--failed",
        entry.kind === "closure" && entry.canceled && "forge-timeline-entry--failed",
        entry.active && "forge-timeline-entry--active",
      )}
      data-kind={entry.kind}
    >
      <span className="forge-timeline-entry-icon" aria-hidden>
        {entry.active ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Icon className="size-3.5" />
        )}
      </span>
      {children}
    </div>
  );
}

function ThoughtBlock({ entry, defaultOpen }: { entry: TimelineEntry; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <TimelineShell entry={entry}>
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
        {open && entry.detail && <p className="forge-details-thought-body">{entry.detail}</p>}
      </div>
    </TimelineShell>
  );
}

/* Briefing — fala do agente pro usuário durante o loop. Tom mais próximo do chat. */
function BriefingBlock({ entry }: { entry: TimelineEntry }) {
  if (!entry.text) return null;
  return (
    <TimelineShell entry={entry}>
      <p className="forge-timeline-briefing" data-testid="timeline-briefing">
        {entry.text}
      </p>
    </TimelineShell>
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
  const hasBody = !!entry.detail || (!!entry.path && !!onOpenFile);

  return (
    <TimelineShell entry={entry}>
      <div className="forge-timeline-tool" data-testid="timeline-tool">
        <button
          type="button"
          className="forge-timeline-tool-header"
          onClick={() => hasBody && setOpen((v) => !v)}
          aria-expanded={open}
          disabled={!hasBody}
        >
          <span className="forge-timeline-tool-headline">{entry.label}</span>
          {hasBody && (
            <ChevronDown
              className={cn(
                "forge-timeline-tool-chevron size-3.5",
                open && "forge-timeline-tool-chevron--open",
              )}
            />
          )}
        </button>
        {open && (
          <div className="forge-timeline-tool-body">
            {entry.path && onOpenFile && (
              <button
                type="button"
                className="forge-timeline-tool-link"
                onClick={() => onOpenFile(entry.path!)}
              >
                Open {entry.path}
              </button>
            )}
            {entry.detail && <pre className="forge-timeline-tool-detail">{entry.detail}</pre>}
          </div>
        )}
      </div>
    </TimelineShell>
  );
}

/* Diff — edição de arquivo com before/after, expansível. */
function DiffBlock({
  entry,
  onOpenFile,
}: {
  entry: TimelineEntry;
  onOpenFile?: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasDiff = !!entry.before || !!entry.after;
  const opLabel = entry.op === "write" ? "Criado" : "Editado";

  return (
    <TimelineShell entry={entry}>
      <div className="forge-timeline-diff" data-testid="timeline-diff">
        <button
          type="button"
          className="forge-timeline-diff-header"
          onClick={() => hasDiff && setOpen((v) => !v)}
          aria-expanded={open}
          disabled={!hasDiff}
        >
          <span className="forge-timeline-diff-op">{opLabel}</span>
          <span className="forge-timeline-diff-path">{entry.path}</span>
          {hasDiff && (
            <ChevronDown
              className={cn(
                "forge-timeline-tool-chevron size-3.5",
                open && "forge-timeline-tool-chevron--open",
              )}
            />
          )}
        </button>
        {open && hasDiff && (
          <div className="forge-timeline-diff-body">
            {entry.before && <pre className="forge-timeline-diff-before">{entry.before}</pre>}
            {entry.after && <pre className="forge-timeline-diff-after">{entry.after}</pre>}
            {entry.path && onOpenFile && (
              <button
                type="button"
                className="forge-timeline-tool-link"
                onClick={() => onOpenFile(entry.path!)}
              >
                Abrir {entry.path}
              </button>
            )}
          </div>
        )}
      </div>
    </TimelineShell>
  );
}

function ResultBlock({ entry }: { entry: TimelineEntry }) {
  return (
    <TimelineShell entry={entry}>
      <div
        className={cn(
          "forge-timeline-result",
          entry.ok === false && "forge-timeline-result--failed",
        )}
        data-testid="timeline-result"
      >
        <span className="forge-timeline-result-label">{entry.label}</span>
      </div>
    </TimelineShell>
  );
}

/* Closure — fechamento do loop. Presença: check verde (ok) ou X (falha/cancelado). */
function ClosureBlock({ entry }: { entry: TimelineEntry }) {
  return (
    <TimelineShell entry={entry}>
      <div className="forge-timeline-closure" data-testid="timeline-closure">
        <span className="forge-timeline-closure-label">
          {entry.canceled ? "Cancelado" : entry.ok === false ? "Encerrado" : "Concluído"}
        </span>
        {entry.text && <p className="forge-timeline-closure-text">{entry.text}</p>}
      </div>
    </TimelineShell>
  );
}

function PhaseBlock({ entry }: { entry: TimelineEntry }) {
  return (
    <TimelineShell entry={entry}>
      <div className="forge-timeline-phase" data-testid="timeline-phase">
        <span className="forge-timeline-phase-label">{entry.label}</span>
      </div>
    </TimelineShell>
  );
}

function CheckpointBlock({ entry }: { entry: TimelineEntry }) {
  const [open, setOpen] = useState(false);
  const evidence = entry.evidence ?? [];

  return (
    <TimelineShell entry={entry}>
      <div className="forge-timeline-checkpoint" data-testid="timeline-checkpoint">
        <button
          type="button"
          className="forge-timeline-checkpoint-header"
          onClick={() => evidence.length > 0 && setOpen((v) => !v)}
          aria-expanded={open}
          disabled={evidence.length === 0}
        >
          <span className="forge-timeline-checkpoint-label">{entry.label}</span>
          {evidence.length > 0 && (
            <ChevronDown
              className={cn(
                "forge-timeline-checkpoint-chevron size-3.5",
                open && "forge-timeline-checkpoint-chevron--open",
              )}
            />
          )}
        </button>
        {open && evidence.length > 0 && (
          <div className="forge-timeline-checkpoint-files">
            {evidence.map((file) => (
              <span key={file} className="forge-timeline-checkpoint-file">
                {file}
              </span>
            ))}
          </div>
        )}
      </div>
    </TimelineShell>
  );
}

export function InspectorActivityFeed({ items, onOpenFile }: InspectorActivityFeedProps) {
  if (!items.length) return null;

  return (
    <div className="forge-inspector-timeline-track" data-testid="inspector-timeline-track">
      {items.map((entry, index) => {
        if (entry.kind === "thought") {
          return (
            <ThoughtBlock key={entry.id} entry={entry} defaultOpen={entry.active || index === 0} />
          );
        }
        if (entry.kind === "briefing") {
          return <BriefingBlock key={entry.id} entry={entry} />;
        }
        if (entry.kind === "diff") {
          return <DiffBlock key={entry.id} entry={entry} onOpenFile={onOpenFile} />;
        }
        if (entry.kind === "closure") {
          return <ClosureBlock key={entry.id} entry={entry} />;
        }
        if (entry.kind === "tool") {
          return <ToolBlock key={entry.id} entry={entry} onOpenFile={onOpenFile} />;
        }
        if (entry.kind === "result") return <ResultBlock key={entry.id} entry={entry} />;
        if (entry.kind === "checkpoint") return <CheckpointBlock key={entry.id} entry={entry} />;
        return <PhaseBlock key={entry.id} entry={entry} />;
      })}
    </div>
  );
}
