import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import type { ForgeTaskItem as TaskItem } from "@/lib/forge-run";

type ForgeTaskItemProps = {
  task: TaskItem;
};

export function ForgeTaskItem({ task }: ForgeTaskItemProps) {
  return (
    <li className="lovable-job-mini-card-step" data-status={task.status}>
      <span className="shrink-0">
        {task.status === "done" ? (
          <CheckCircle2 className="size-3.5 forge-animate-task-check" />
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
  );
}