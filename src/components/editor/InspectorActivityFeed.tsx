import { useState, type ComponentType, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  FileCode,
  FilePlus,
  FileText,
  FolderOpen,
  GitCompare,
  Globe,
  Lightbulb,
  Loader2,
  Palette,
  Pencil,
  Search,
  TerminalSquare,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ForgeTimelineItem } from "@/lib/timeline-builder";
import type { PendingPlan, PlanStep } from "@/lib/agent-progress";

type InspectorActivityFeedProps = {
  items: ForgeTimelineItem[];
  plan?: PendingPlan | null;
  onOpenFile?: (path: string) => void;
  running?: boolean;
};

type TimelineIcon = ComponentType<{ className?: string }>;

function iconForItem(item: ForgeTimelineItem): TimelineIcon {
  switch (item.type) {
    case "THOUGHT":
      return Brain;
    case "NOTE":
      return Lightbulb;
    case "READ":
      return item.path.startsWith("http") ? Globe : FileText;
    case "LISTED":
      return FolderOpen;
    case "CREATED":
      return FilePlus;
    case "EDITED":
      return Pencil;
    case "RUNNING":
      return TerminalSquare;
    case "SKILL":
      if (/design/i.test(item.name)) return Palette;
      if (/search|research/i.test(item.name)) return Search;
      return Zap;
    case "TASK":
      return item.label?.toLowerCase().includes("plano") ? BookOpen : CircleDashed;
    case "RESULT":
      return item.ok ? CheckCircle2 : XCircle;
    case "ALERT":
      return item.level === "error" ? XCircle : AlertTriangle;
    case "DESIGN":
      return Palette;
    case "DIFF":
      return GitCompare;
    case "CLOSURE":
      return item.canceled ? XCircle : item.ok ? CheckCircle2 : XCircle;
    default:
      return CircleDashed;
  }
}

function badgeForItem(item: ForgeTimelineItem): string | null {
  switch (item.type) {
    case "READ":
      return "Read";
    case "LISTED":
      return "Listed";
    case "CREATED":
      return "Created";
    case "EDITED":
      return item.active ? "Editing" : "Edited";
    case "RUNNING":
      return "Running";
    case "SKILL":
      return "Skill";
    case "RESULT":
      return "Result";
    case "ALERT":
      return "Alert";
    case "DESIGN":
      return "Design";
    case "DIFF":
      return item.op === "write" ? "Created" : "Edited";
    case "TASK":
      return "Task";
    default:
      return null;
  }
}

function itemStatus(item: ForgeTimelineItem): "done" | "failed" | "working" | "pending" | null {
  if (item.type === "THOUGHT") return item.active ? "working" : null;
  if (item.type === "RUNNING" || item.type === "EDITED" || item.type === "CREATED" || item.type === "SKILL" || item.type === "READ" || item.type === "LISTED") {
    if (item.active) return "working";
    if (item.ok === false) return "failed";
    if (item.ok === true) return "done";
    return null;
  }
  if (item.type === "RESULT") return item.ok ? "done" : "failed";
  if (item.type === "CLOSURE") return item.canceled ? "failed" : item.ok ? "done" : "failed";
  if (item.type === "DIFF") return "done";
  if (item.type === "ALERT") return item.level === "error" ? "failed" : item.level === "warn" ? "pending" : null;
  return null;
}

function statusDot(status: ReturnType<typeof itemStatus>): ReactNode {
  if (status === "done") return <span className="forge-timeline-status-dot forge-timeline-status-dot--done" />;
  if (status === "failed") return <span className="forge-timeline-status-dot forge-timeline-status-dot--failed" />;
  if (status === "working") return <span className="forge-timeline-status-dot forge-timeline-status-dot--working" />;
  if (status === "pending") return <span className="forge-timeline-status-dot forge-timeline-status-dot--pending" />;
  return null;
}

function isLastItem(index: number, total: number): boolean {
  return index === total - 1;
}

function TimelineShell({
  item,
  index,
  total,
  children,
}: {
  item: ForgeTimelineItem;
  index: number;
  total: number;
  children: ReactNode;
}) {
  const Icon = iconForItem(item);
  const active = (item.type !== "NOTE" && item.type !== "TASK" && item.type !== "RESULT" && item.type !== "ALERT" && item.type !== "DESIGN" && item.type !== "DIFF" && item.type !== "CLOSURE" && item.active) || false;
  const status = itemStatus(item);
  return (
    <div
      className={cn(
        "forge-inspector-timeline-entry",
        `forge-timeline-entry--${item.type.toLowerCase()}`,
        (status === "failed" || (item.type === "CLOSURE" && item.canceled)) && "forge-timeline-entry--failed",
        active && "forge-timeline-entry--active",
      )}
      data-type={item.type}
    >
      <span className="forge-timeline-entry-icon" aria-hidden>
        {active ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Icon className="size-3.5" />
        )}
      </span>
      <div className="forge-timeline-line" data-active={active || undefined} data-last={isLastItem(index, total) || undefined} />
      {children}
    </div>
  );
}

function ThoughtBlock({ item, index, total }: { item: Extract<ForgeTimelineItem, { type: "THOUGHT" }>; index: number; total: number }) {
  const [open, setOpen] = useState(false);
  const durationSeconds = Math.max(1, Math.round(item.durationMs / 1000));

  return (
    <TimelineShell item={item} index={index} total={total}>
      <div className="forge-details-thought" data-testid="timeline-thought">
        <button
          type="button"
          className="forge-details-thought-header"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="forge-details-thought-label">Thought for {durationSeconds}s</span>
          {item.active && (
            <Loader2 className="size-3 animate-spin" style={{ color: "var(--text-accent)" }} />
          )}
          <ChevronDown
            className={cn("forge-details-chevron size-3.5", open && "forge-details-chevron--open")}
          />
        </button>
        {open && item.text && <p className="forge-details-thought-body">{item.text}</p>}
      </div>
    </TimelineShell>
  );
}

function NoteBlock({ item, index, total }: { item: Extract<ForgeTimelineItem, { type: "NOTE" }>; index: number; total: number }) {
  return (
    <TimelineShell item={item} index={index} total={total}>
      <div className="forge-timeline-note" data-testid="timeline-note">
        {item.title && <span className="forge-timeline-note-title">{item.title}</span>}
        <p className="forge-timeline-note-text">{item.text}</p>
      </div>
    </TimelineShell>
  );
}

function ToolishBlock({
  item,
  index,
  total,
  onOpenFile,
}: {
  item:
    | Extract<ForgeTimelineItem, { type: "READ" }>
    | Extract<ForgeTimelineItem, { type: "LISTED" }>
    | Extract<ForgeTimelineItem, { type: "CREATED" }>
    | Extract<ForgeTimelineItem, { type: "EDITED" }>
    | Extract<ForgeTimelineItem, { type: "RUNNING" }>
    | Extract<ForgeTimelineItem, { type: "SKILL" }>;
  index: number;
  total: number;
  onOpenFile?: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const badge = badgeForItem(item);
  const title =
    item.type === "RUNNING"
      ? item.command
      : item.type === "SKILL"
        ? item.name
        : item.path || item.detail || "";
  const detail = item.type === "RUNNING" ? item.detail : item.type === "SKILL" ? item.detail : item.detail;
  const status = itemStatus(item);
  const hasBody = !!detail || (!!title && onOpenFile && item.type !== "RUNNING" && item.type !== "SKILL");

  return (
    <TimelineShell item={item} index={index} total={total}>
      <div className="forge-timeline-tool" data-testid={`timeline-${item.type.toLowerCase()}`}>
        <button
          type="button"
          className="forge-timeline-tool-header"
          onClick={() => hasBody && setOpen((v) => !v)}
          aria-expanded={open}
          disabled={!hasBody}
        >
          {badge && <span className="forge-timeline-badge">{badge}</span>}
          <span className="forge-timeline-tool-headline">{title}</span>
          <span className="forge-timeline-status-slot">{statusDot(status)}</span>
          {hasBody && (
            <ChevronDown
              className={cn(
                "forge-timeline-tool-chevron size-3.5",
                open && "forge-timeline-tool-chevron--open",
              )}
            />
          )}
        </button>
        {open && hasBody && (
          <div className="forge-timeline-tool-body">
            {title && onOpenFile && item.type !== "RUNNING" && item.type !== "SKILL" && (
              <button
                type="button"
                className="forge-timeline-tool-link"
                onClick={() => onOpenFile(title)}
              >
                Open {title}
              </button>
            )}
            {detail && <pre className="forge-timeline-tool-detail">{detail}</pre>}
          </div>
        )}
      </div>
    </TimelineShell>
  );
}

function TaskBlock({ item, index, total, plan }: { item: Extract<ForgeTimelineItem, { type: "TASK" }>; index: number; total: number; plan?: PendingPlan | null }) {
  return (
    <TimelineShell item={item} index={index} total={total}>
      <div className="forge-timeline-task" data-testid="timeline-task">
        <span className="forge-timeline-task-label">{item.label}</span>
        {plan && plan.steps.length > 0 && (
          <PlanCard plan={plan} />
        )}
      </div>
    </TimelineShell>
  );
}

function PlanCard({ plan }: { plan: PendingPlan }) {
  return (
    <div className="forge-timeline-plan-card">
      <div className="forge-timeline-plan-card-header">
        <BookOpen className="size-3" />
        <span>Plan</span>
        <span className="forge-timeline-plan-card-meta">{plan.steps.length} steps</span>
      </div>
      <div className="forge-timeline-plan-steps">
        {plan.steps.map((step, idx) => (
          <PlanStepItem key={step.id || idx} step={step} index={idx} />
        ))}
      </div>
    </div>
  );
}

function PlanStepItem({ step, index }: { step: PlanStep; index: number }) {
  return (
    <div className="forge-timeline-plan-step">
      <span className="forge-timeline-plan-step-number">{index + 1}</span>
      <FileCode className="size-3.5 mt-0.5 shrink-0 text-[var(--text-muted)]" />
      <span className="forge-timeline-plan-step-desc">{step.description}</span>
    </div>
  );
}

function ResultBlock({ item, index, total }: { item: Extract<ForgeTimelineItem, { type: "RESULT" }>; index: number; total: number }) {
  return (
    <TimelineShell item={item} index={index} total={total}>
      <div
        className={cn(
          "forge-timeline-result",
          !item.ok && "forge-timeline-result--failed",
        )}
        data-testid="timeline-result"
      >
        <span className="forge-timeline-badge">{badgeForItem(item)}</span>
        <span className="forge-timeline-result-label">{item.text}</span>
        {item.evidence && item.evidence.length > 0 && (
          <div className="forge-timeline-evidence">
            {item.evidence.map((file) => (
              <span key={file} className="forge-timeline-evidence-chip">
                {file}
              </span>
            ))}
          </div>
        )}
      </div>
    </TimelineShell>
  );
}

function AlertBlock({ item, index, total }: { item: Extract<ForgeTimelineItem, { type: "ALERT" }>; index: number; total: number }) {
  return (
    <TimelineShell item={item} index={index} total={total}>
      <div className={cn("forge-timeline-alert", item.level === "error" && "forge-timeline-alert--error")} data-testid="timeline-alert">
        <span className="forge-timeline-badge forge-timeline-badge--warn">{badgeForItem(item)}</span>
        <span className="forge-timeline-alert-message">{item.message}</span>
      </div>
    </TimelineShell>
  );
}

function DesignBlock({ item, index, total }: { item: Extract<ForgeTimelineItem, { type: "DESIGN" }>; index: number; total: number }) {
  return (
    <TimelineShell item={item} index={index} total={total}>
      <div className="forge-timeline-design" data-testid="timeline-design">
        <span className="forge-timeline-badge forge-timeline-badge--design">{badgeForItem(item)}</span>
        <span className="forge-timeline-design-title">{item.title}</span>
        {item.detail && <p className="forge-timeline-design-detail">{item.detail}</p>}
        {item.references && item.references.length > 0 && (
          <div className="forge-timeline-evidence">
            {item.references.map((ref) => (
              <span key={ref} className="forge-timeline-evidence-chip">
                {ref}
              </span>
            ))}
          </div>
        )}
      </div>
    </TimelineShell>
  );
}

function DiffBlock({
  item,
  index,
  total,
  onOpenFile,
}: {
  item: Extract<ForgeTimelineItem, { type: "DIFF" }>;
  index: number;
  total: number;
  onOpenFile?: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasDiff = !!item.before || !!item.after;
  const opLabel = item.op === "write" ? "Created" : "Edited";

  return (
    <TimelineShell item={item} index={index} total={total}>
      <div className="forge-timeline-diff" data-testid="timeline-diff">
        <button
          type="button"
          className="forge-timeline-diff-header"
          onClick={() => hasDiff && setOpen((v) => !v)}
          aria-expanded={open}
          disabled={!hasDiff}
        >
          <span className={cn("forge-timeline-diff-op", item.op === "write" && "forge-timeline-diff-op--write")}>{opLabel}</span>
          <span className="forge-timeline-diff-path">{item.path}</span>
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
            {item.before && <pre className="forge-timeline-diff-before">{item.before}</pre>}
            {item.after && <pre className="forge-timeline-diff-after">{item.after}</pre>}
            {item.path && onOpenFile && (
              <button
                type="button"
                className="forge-timeline-tool-link"
                onClick={() => onOpenFile(item.path)}
              >
                Open {item.path}
              </button>
            )}
          </div>
        )}
      </div>
    </TimelineShell>
  );
}

function ClosureBlock({ item, index, total }: { item: Extract<ForgeTimelineItem, { type: "CLOSURE" }>; index: number; total: number }) {
  return (
    <TimelineShell item={item} index={index} total={total}>
      <div className="forge-timeline-closure" data-testid="timeline-closure">
        <span className="forge-timeline-closure-label">
          {item.canceled ? "Canceled" : item.ok === false ? "Failed" : "Done"}
        </span>
        {item.text && <p className="forge-timeline-closure-text">{item.text}</p>}
      </div>
    </TimelineShell>
  );
}

export function InspectorActivityFeed({ items, plan, onOpenFile }: InspectorActivityFeedProps) {
  if (!items.length) return null;

  return (
    <div className="forge-inspector-timeline-track" data-testid="inspector-timeline-track">
      {items.map((item, index) => {
        const common = { index, total: items.length };
        switch (item.type) {
          case "THOUGHT":
            return <ThoughtBlock key={item.id} item={item} {...common} />;
          case "NOTE":
            return <NoteBlock key={item.id} item={item} {...common} />;
          case "READ":
          case "LISTED":
          case "CREATED":
          case "EDITED":
          case "RUNNING":
          case "SKILL":
            return <ToolishBlock key={item.id} item={item} {...common} onOpenFile={onOpenFile} />;
          case "TASK":
            return <TaskBlock key={item.id} item={item} {...common} plan={plan} />;
          case "RESULT":
            return <ResultBlock key={item.id} item={item} {...common} />;
          case "ALERT":
            return <AlertBlock key={item.id} item={item} {...common} />;
          case "DESIGN":
            return <DesignBlock key={item.id} item={item} {...common} />;
          case "DIFF":
            return <DiffBlock key={item.id} item={item} {...common} onOpenFile={onOpenFile} />;
          case "CLOSURE":
            return <ClosureBlock key={item.id} item={item} {...common} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
