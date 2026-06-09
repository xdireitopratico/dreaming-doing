import { useMemo } from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentProgress } from "@/lib/agent-progress";
import {
  buildJobStream,
  deriveCardView,
  type AtomStatus,
} from "@/lib/agent-job-stream";

type AgentJobMiniCardProps = {
  progress: AgentProgress;
  runId?: string;
  isActive: boolean;
  isFocused?: boolean;
  onOpen?: (runId: string) => void;
};

function StepIcon({ state }: { state: AtomStatus }) {
  if (state === "done") return <Check className="size-3.5 shrink-0 text-emerald-400/90" />;
  if (state === "active") {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--forge-primary)]" />;
  }
  if (state === "failed") {
    return <Circle className="size-3.5 shrink-0 text-amber-400/90 fill-amber-400/20" />;
  }
  return <Circle className="size-3 shrink-0 text-[var(--forge-ghost)]" />;
}

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
    const atoms = buildJobStream(progress.timeline, { running: running || !progress.finished });
    return deriveCardView(atoms, progress, { running: running || !progress.finished });
  }, [progress.timeline, progress.finished, progress.lastFinishOk, progress.canceled, progress.autoResuming, running]);

  const handleClick = () => {
    onOpen?.(resolvedRunId);
  };

  return (
    <button
      type="button"
      className={cn(
        "lovable-job-mini-card w-full text-left",
        view.cardStatus === "working" && "lovable-job-mini-card--working",
        view.cardStatus === "done" && "lovable-job-mini-card--done",
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
        {view.headerBadge === "done" && (
          <span className="lovable-job-mini-card-badge-done">Done</span>
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

      {view.tailSteps.length > 0 && (
        <ul className="lovable-job-mini-card-steps" aria-label="Job stream">
          {view.tailSteps.map((step) => (
            <li key={step.id} className="lovable-job-mini-card-step">
              <StepIcon state={step.status} />
              <span
                className={cn(
                  step.status === "done" && "text-[var(--forge-muted)]",
                  step.status === "active" && "text-[var(--forge-foreground)]",
                  step.status === "pending" && "text-[var(--forge-ghost)]",
                  step.status === "failed" && "text-amber-400/90",
                )}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}