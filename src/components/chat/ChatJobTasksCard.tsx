import { useState } from "react";
import { Check, Circle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MiniCardData, RunPhase } from "@/lib/chat/types";

type ChatJobTasksCardProps = {
  data: MiniCardData;
  isFocused?: boolean;
  phase?: RunPhase | "preflight" | null;
};

function taskStatusIcon(status: "pending" | "active" | "done" | "failed"): React.ReactNode {
  switch (status) {
    case "done":
      return <Check className="size-3 text-[var(--status-done)]" />;
    case "active":
      return <Loader2 className="size-3 animate-spin text-[var(--status-working)]" />;
    case "failed":
      return <X className="size-3 text-[var(--status-failed)]" />;
    default:
      return <Circle className="size-3 text-[var(--text-muted)]" />;
  }
}

function compactTaskText(task: { label: string; criteria?: string }, max = 120): string {
  const text = [task.label.trim(), task.criteria?.trim()].filter(Boolean).join(" · ");
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function ChatJobTasksCard({ data, isFocused, phase }: ChatJobTasksCardProps) {
  const tasks = data.tasks ?? [];
  const isLive = data.status === "working" || data.status === "thinking";
  if (phase === "plan" || phase === "preflight") return null;
  const materializingTasksPhase = phase === "build" || phase === "execute";
  const showSkeleton = isLive && materializingTasksPhase && tasks.length === 0;
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const TASKS_PREVIEW = 4;
  const visibleTasks = tasksExpanded ? tasks : tasks.slice(0, TASKS_PREVIEW);
  const hasMoreTasks = tasks.length > TASKS_PREVIEW;
  const hiddenTasksCount = tasks.length - TASKS_PREVIEW;

  if (!showSkeleton && tasks.length === 0) return null;

  return (
    <div
      className={cn("forge-job-tasks-dock", isFocused && "forge-job-tasks-dock--focused")}
      data-testid="chat-job-tasks-card"
    >
      <div
        className={cn(
          "forge-plan-dock-shell",
          showSkeleton ? "forge-job-tasks-shell--skeleton" : "forge-job-tasks-shell--ready",
        )}
      >
        {showSkeleton ? (
          <>
            <div className="forge-plan-dock-shimmer-lines" aria-hidden>
              <div className="forge-plan-dock-shimmer-line" style={{ width: "42%" }} />
              <div className="forge-plan-dock-shimmer-line" style={{ width: "78%" }} />
              <div className="forge-plan-dock-shimmer-line" style={{ width: "58%" }} />
              <div className="forge-plan-dock-shimmer-line" style={{ width: "36%" }} />
            </div>
            <p className="forge-plan-dock-creating-label">Preparing tasks…</p>
          </>
        ) : (
          <>
            <div className="forge-job-tasks-header">
              <p className="forge-plan-dock-label forge-plan-dock-label--icon">
                <Circle className="size-3" aria-hidden />
                Tasks
              </p>
              <span className="forge-plan-dock-step-count">
                {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
              </span>
            </div>

            <ul className="forge-job-tasks-list" data-testid="chat-job-tasks-list">
              {visibleTasks.map((task, idx) => (
                <li
                  key={task.id || idx}
                  className={cn(
                    "forge-mini-card-task-item",
                    `forge-mini-card-task-item--${task.status}`,
                  )}
                  data-status={task.status}
                >
                  <span className="forge-mini-card-task-status" aria-hidden>
                    {taskStatusIcon(task.status)}
                  </span>
                  <span className="forge-mini-card-task-body">
                    <span
                      className="forge-mini-card-task-label"
                      title={[task.label, task.criteria].filter(Boolean).join(" · ")}
                    >
                      {compactTaskText(task)}
                    </span>
                  </span>
                </li>
              ))}
              {hasMoreTasks && (
                <li>
                  <button
                    type="button"
                    className="forge-mini-card-task-toggle"
                    onClick={() => setTasksExpanded((v) => !v)}
                    data-testid="chat-job-tasks-toggle"
                  >
                    {tasksExpanded ? "Ver menos" : `+${hiddenTasksCount} tarefas`}
                  </button>
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
