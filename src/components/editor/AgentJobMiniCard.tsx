import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { AgentProgress } from "@/lib/agent-progress";
import {
  buildJobStreamTree,
  deriveCardView,
} from "@/lib/agent-job-stream";
import { JobInlineTimeline } from "@/components/editor/JobInlineTimeline";

type AgentJobMiniCardProps = {
  progress: AgentProgress;
  runId?: string;
  isActive: boolean;
  isFocused?: boolean;
  onOpen?: (runId: string) => void;
};

export function AgentJobMiniCard({
  progress,
  runId,
  isActive,
  isFocused,
  onOpen,
}: AgentJobMiniCardProps) {
  const running = isActive && !progress.finished;
  const resolvedRunId = runId ?? "live";

  const { view, nodes } = useMemo(() => {
    const tree = buildJobStreamTree(progress.timeline, {
      running: running || !progress.finished,
    });
    const cardView = deriveCardView(tree, progress, {
      running: running || !progress.finished,
    });
    return { view: cardView, nodes: tree };
  }, [
    progress.timeline,
    progress.finished,
    progress.lastFinishOk,
    progress.canceled,
    progress.autoResuming,
    progress.message,
    progress.statusHint,
    progress.phase,
    running,
  ]);

  const handleClick = () => {
    onOpen?.(resolvedRunId);
  };

  return (
    <button
      type="button"
      className={cn(
        "lovable-job-mini-card w-full text-left",
        view.cardStatus === "working" && "lovable-job-mini-card--working",

        isFocused && "lovable-job-mini-card--focused",
      )}
      data-testid="agent-job-mini-card"
      data-run-id={resolvedRunId}
      onClick={handleClick}
      aria-label={
        view.cardStatus === "working"
          ? `Job em andamento: ${view.title}`
          : `Job: ${view.title}`
      }
    >
      <div className="lovable-job-mini-card-header">
        {view.headerBadge === "working" && (
          <span className="lovable-job-mini-card-badge-working">Working…</span>
        )}
        {view.headerBadge === "failed" && (
          <span className="lovable-job-mini-card-badge-partial">Failed</span>
        )}
        {view.editedFile && (
          <span className="lovable-job-mini-card-badge-edited">
            Edited <span className="font-mono">{view.editedFile}</span>
          </span>
        )}
      </div>

      <p className="lovable-job-mini-card-title">{view.title}</p>

      <JobInlineTimeline nodes={nodes} variant="chat" />
    </button>
  );
}