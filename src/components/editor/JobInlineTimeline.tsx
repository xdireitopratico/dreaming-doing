import { useState } from "react";
import { ChevronDown, FileEdit, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobStreamNode } from "@/lib/agent-job-stream";
import { chatPersistedNodes, miniVisibleNodes } from "@/lib/agent-job-stream";
import { FileRefChip } from "@/components/editor/FileRefChip";

type TimelineVariant = "full" | "mini" | "chat";

type JobInlineTimelineProps = {
  nodes: JobStreamNode[];
  variant?: TimelineVariant;
  onOpenFile?: (path: string) => void;
};

function JobThoughtBlock({
  node,
  variant,
}: {
  node: Extract<JobStreamNode, { kind: "thought" }>;
  variant: TimelineVariant;
}) {
  const [open, setOpen] = useState(variant === "full");
  const isMini = variant === "mini";
  const isChat = variant === "chat";
  const label = `Thought for ${node.thoughtSec}s`;

  return (
    <div
      className={cn(
        "lovable-thought-block",
        isMini && "lovable-thought-block--mini",
        isChat && "lovable-thought-block--chat",
      )}
      data-status={node.status}
    >
      <button
        type="button"
        className="lovable-thought-block-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="lovable-thought-block-label">{label}</span>
        {node.status === "active" && (
          <Loader2 className="size-3 animate-spin text-[var(--forge-primary)]" />
        )}
        <ChevronDown
          className={cn(
            "lovable-thought-block-chevron size-3.5",
            open && "lovable-thought-block-chevron--open",
          )}
        />
      </button>
      {(open || isMini || isChat) && node.prose && (
        <p className="lovable-thought-block-prose">{node.prose}</p>
      )}
    </div>
  );
}

function JobTaskBubble({
  node,
  variant,
}: {
  node: Extract<JobStreamNode, { kind: "task" }>;
  variant: TimelineVariant;
}) {
  return (
    <div
      className={cn(
        "lovable-task-bubble",
        variant === "mini" && "lovable-task-bubble--mini",
        variant === "chat" && "lovable-task-bubble--chat",
      )}
    >
      <span className="lovable-task-bubble-label">Task</span>
      <p className="lovable-task-bubble-title">{node.title}</p>
    </div>
  );
}

function JobStepBubble({
  node,
  variant,
  onOpenFile,
}: {
  node: Extract<JobStreamNode, { kind: "step" }>;
  variant: TimelineVariant;
  onOpenFile?: (path: string) => void;
}) {
  return (
    <div
      className={cn(
        "lovable-step-bubble",
        node.status === "active" && "lovable-step-bubble--active",
        node.status === "done" && "lovable-step-bubble--done",
        node.status === "failed" && "lovable-step-bubble--failed",
        variant === "mini" && "lovable-step-bubble--mini",
        variant === "chat" && "lovable-step-bubble--chat",
      )}
      data-technical={node.technicalLabel}
    >
      <div className="lovable-step-bubble-row">
        {node.status === "active" && (
          <Loader2 className="lovable-step-bubble-spinner size-3.5 shrink-0 animate-spin" />
        )}
        <p className="lovable-step-bubble-expectation">{node.expectation}</p>
      </div>
      {node.files.length > 0 && (
        <div className="lovable-step-bubble-files">
          {node.files.map((f) => (
            <FileRefChip
              key={f.path}
              file={f}
              onOpenFile={onOpenFile}
              variant={variant === "chat" ? "mini" : variant}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function JobResultBubble({
  node,
  variant,
}: {
  node: Extract<JobStreamNode, { kind: "result" }>;
  variant: TimelineVariant;
}) {
  return (
    <div
      className={cn(
        "lovable-result-bubble",
        node.status === "failed" && "lovable-result-bubble--failed",
        variant === "mini" && "lovable-result-bubble--mini",
        variant === "chat" && "lovable-result-bubble--chat",
      )}
    >
      <span className="lovable-result-bubble-label">Result</span>
      <p className="lovable-result-bubble-summary">{node.summary}</p>
      {node.evidence.length > 0 && (variant === "full" || variant === "chat") && (
        <ol className="lovable-result-bubble-evidence">
          {node.evidence.map((item, i) => (
            <li key={`${node.id}-ev-${i}`}>{item}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function JobDiffBubble({
  node,
  variant,
  onOpenFile,
}: {
  node: Extract<JobStreamNode, { kind: "diff" }>;
  variant: TimelineVariant;
  onOpenFile?: (path: string) => void;
}) {
  const fileName = node.path.split("/").pop() ?? node.path;
  const changeType = node.op === "write" ? "criou" : "editou";
  const sizeChange = node.afterLength - node.beforeLength;
  const sign = sizeChange >= 0 ? "+" : "";
  const label = `${changeType} ${fileName} (${sign}${sizeChange} linhas)`;

  return (
    <div
      className={cn(
        "lovable-step-bubble lovable-diff-bubble",
        variant === "mini" && "lovable-step-bubble--mini",
        variant === "chat" && "lovable-step-bubble--chat",
      )}
    >
      <div className="lovable-step-bubble-row">
        <FileEdit className="size-3.5 shrink-0 text-[var(--forge-primary)]" />
        <p className="lovable-step-bubble-expectation">{label}</p>
      </div>
      <div className="lovable-step-bubble-files">
        <FileRefChip
          file={{
            path: node.path,
            langLabel: node.path.split(".").pop()?.toUpperCase() ?? "",
            fileName,
          }}
          onOpenFile={onOpenFile}
          variant={variant === "chat" ? "mini" : "chat"}
        />
      </div>
    </div>
  );
}

function TimelineNode({
  node,
  variant,
  showConnector,
  onOpenFile,
}: {
  node: JobStreamNode;
  variant: TimelineVariant;
  showConnector: boolean;
  onOpenFile?: (path: string) => void;
}) {
  return (
    <div
      className={cn(
        "lovable-inline-timeline-node",
        showConnector && "lovable-inline-timeline-node--connected",
      )}
    >
      {showConnector && <span className="lovable-inline-timeline-connector" aria-hidden />}
      {node.kind === "thought" && <JobThoughtBlock node={node} variant={variant} />}
      {node.kind === "task" && <JobTaskBubble node={node} variant={variant} />}
      {node.kind === "step" && (
        <JobStepBubble node={node} variant={variant} onOpenFile={onOpenFile} />
      )}
      {node.kind === "result" && <JobResultBubble node={node} variant={variant} />}
      {node.kind === "diff" && <JobDiffBubble node={node} variant={variant} onOpenFile={onOpenFile} />}
    </div>
  );
}

export function JobInlineTimeline({
  nodes,
  variant = "full",
  onOpenFile,
}: JobInlineTimelineProps) {
  const displayNodes =
    variant === "mini"
      ? miniVisibleNodes(nodes)
      : variant === "chat"
        ? chatPersistedNodes(nodes)
        : nodes;

  if (displayNodes.length === 0) return null;

  return (
    <div
      className={cn(
        "lovable-inline-timeline",
        variant === "mini" && "lovable-inline-timeline--mini",
        variant === "chat" && "lovable-inline-timeline--chat",
      )}
      data-testid={
        variant === "chat"
          ? "job-inline-timeline-chat"
          : variant === "mini"
            ? "job-inline-timeline-mini"
            : "job-inline-timeline-full"
      }
    >
      {displayNodes.map((node, index) => (
        <TimelineNode
          key={node.id}
          node={node}
          variant={variant}
          showConnector={
            (variant === "full" || variant === "chat") && index < displayNodes.length - 1
          }
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}