import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { AgentProgress } from "@/lib/agent-progress";
import {
  buildJobStreamTree,
  deriveCardView,
} from "@/lib/agent-job-stream";

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

  const view = useMemo(() => {
    const tree = buildJobStreamTree(progress.timeline, {
      running: running || !progress.finished,
    });
    return deriveCardView(tree, progress, {
      running: running || !progress.finished,
    });
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
    <div
      className={cn(
        "lovable-job-mini-card w-full",
        view.cardStatus === "working" && "lovable-job-mini-card--working",
        isFocused && "lovable-job-mini-card--focused",
      )}
      data-testid="agent-job-mini-card"
      data-run-id={resolvedRunId}
    >
      <button
        type="button"
        className="lovable-job-mini-card-body"
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
        <p className="lovable-job-mini-card-hint">Timeline completa no inspector →</p>
      </button>
    </div>
  );
}