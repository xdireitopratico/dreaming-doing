import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentProgress } from "@/lib/agent-progress";
import {
  buildStatusChips,
  buildWorkingSteps,
  buildWorkingTitle,
  lastEditedPath,
} from "@/lib/agent-working-steps";

type AgentJobMiniCardProps = {
  progress: AgentProgress;
  runId?: string;
  isActive: boolean;
  isFocused?: boolean;
  onOpen?: (runId: string) => void;
};

function fileBase(path: string): string {
  const p = path.replace(/^\/+/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function StepIcon({ state }: { state: "pending" | "active" | "done" }) {
  if (state === "done") return <Check className="size-3.5 shrink-0 text-emerald-400/90" />;
  if (state === "active") {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--forge-primary)]" />;
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
  const title = buildWorkingTitle(progress, running || !progress.finished);
  const steps = buildWorkingSteps(progress, { running: running || !progress.finished });
  const chips = buildStatusChips(progress, running);
  const edited = lastEditedPath(progress);
  const resolvedRunId = runId ?? "live";

  const handleClick = () => {
    onOpen?.(resolvedRunId);
  };

  const showWorking = running || (!progress.finished && isActive);
  const showDone = progress.finished && !progress.canceled && progress.lastFinishOk !== false;

  return (
    <button
      type="button"
      className={cn(
        "lovable-job-mini-card w-full text-left",
        showWorking && "lovable-job-mini-card--working",
        showDone && "lovable-job-mini-card--done",
        isFocused && "lovable-job-mini-card--focused",
      )}
      data-testid="agent-job-mini-card"
      data-run-id={resolvedRunId}
      onClick={handleClick}
      aria-label={showWorking ? `Job em andamento: ${title}. Clique para ver timeline.` : `Job: ${title}. Clique para ver detalhes.`}
    >
      <div className="lovable-job-mini-card-header">
        {showWorking && (
          <span className="lovable-job-mini-card-badge-working">Working…</span>
        )}
        {showDone && !showWorking && (
          <span className="lovable-job-mini-card-badge-done">Concluído</span>
        )}
        {progress.finished && progress.lastFinishOk === false && !progress.canceled && (
          <span className="lovable-job-mini-card-badge-partial">Entrega parcial</span>
        )}
        {edited && (
          <span className="lovable-job-mini-card-badge-edited">
            Edited <span className="font-mono">{fileBase(edited)}</span>
          </span>
        )}
      </div>

      <p className="lovable-job-mini-card-title">{title}</p>

      {chips.length > 0 && (
        <div className="lovable-job-mini-card-chips">
          {chips.map((chip) => (
            <span key={chip} className="lovable-job-mini-card-chip">
              {chip}
            </span>
          ))}
        </div>
      )}

      <ul className="lovable-job-mini-card-steps" aria-label="Passos do job">
        {steps.map((step) => (
          <li key={step.id} className="lovable-job-mini-card-step">
            <StepIcon state={step.state} />
            <span
              className={cn(
                step.state === "done" && "text-[var(--forge-muted)]",
                step.state === "active" && "text-[var(--forge-foreground)]",
                step.state === "pending" && "text-[var(--forge-ghost)]",
              )}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ul>

      <p className="lovable-job-mini-card-hint">
        {isFocused ? "Timeline aberta no preview" : "Clique para ver timeline no preview →"}
      </p>
    </button>
  );
}