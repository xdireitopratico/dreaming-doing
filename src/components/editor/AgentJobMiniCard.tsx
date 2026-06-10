import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import type { AgentProgress, PendingPlan } from "@/lib/agent-progress";
import {
  buildJobStreamTree,
  deriveCardView,
} from "@/lib/agent-job-stream";

type TaskItem = {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "failed";
};

function buildTaskList(
  progress: AgentProgress,
  pendingPlan?: PendingPlan | null,
): TaskItem[] {
  // Se há plano pendente, usa os passos do plano como tarefas atômicas
  if (pendingPlan?.steps?.length) {
    return pendingPlan.steps.map((step, idx) => {
      const stepStatus = progress.finished
        ? "done"
        : progress.phase === "execute" && idx < (progress.currentStep ?? 0)
          ? "done"
          : progress.phase === "execute" && idx === (progress.currentStep ?? 0)
            ? "active"
            : "pending";
      return {
        id: step.id,
        label: step.description,
        status: stepStatus,
      };
    });
  }

  // Se não há plano, deriva tarefas da timeline (fases + tools)
  const tree = buildJobStreamTree(progress.timeline, {
    running: !progress.finished,
  });
  const tasks: TaskItem[] = [];
  for (const node of tree) {
    if (node.kind === "task") {
      tasks.push({
        id: node.id,
        label: node.title,
        status: "done",
      });
    } else if (node.kind === "step") {
      const existing = tasks.find((t) => t.id === node.id);
      if (!existing) {
        tasks.push({
          id: node.id,
          label: node.expectation || node.technicalLabel,
          status: node.status === "active" ? "active" : node.status === "failed" ? "failed" : "done",
        });
      }
    }
  }
  return tasks.slice(-8); // máximo 8 tarefas visíveis
}

type AgentJobMiniCardProps = {
  progress: AgentProgress;
  runId?: string;
  isActive: boolean;
  isFocused?: boolean;
  pendingPlan?: PendingPlan | null;
  onOpen?: (runId: string) => void;
};

export function AgentJobMiniCard({
  progress,
  runId,
  isActive,
  isFocused,
  pendingPlan,
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

  const tasks = useMemo(
    () => buildTaskList(progress, pendingPlan),
    [progress, pendingPlan],
  );

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

        {/* Lista atômica de tarefas */}
        {tasks.length > 0 && (
          <ul className="lovable-job-task-list mt-2 space-y-1">
            {tasks.map((task) => (
              <li
                key={task.id}
                className={cn(
                  "lovable-job-task-item flex items-center gap-2 text-[11px]",
                  task.status === "done" && "text-emerald-400/80",
                  task.status === "active" && "text-[var(--forge-primary)]",
                  task.status === "failed" && "text-amber-400/80",
                  task.status === "pending" && "text-[var(--forge-muted)]",
                )}
              >
                <span className="shrink-0">
                  {task.status === "done" ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : task.status === "active" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : task.status === "failed" ? (
                    <XCircle className="size-3.5" />
                  ) : (
                    <Circle className="size-3.5" />
                  )}
                </span>
                <span className="truncate">{task.label}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="lovable-job-mini-card-hint">Timeline completa no inspector →</p>
      </button>
    </div>
  );
}
