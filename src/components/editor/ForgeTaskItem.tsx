import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { ForgeTaskItem as TaskItem } from "@/lib/forge-run";

type ForgeTaskItemProps = {
  task: TaskItem;
};

export function ForgeTaskItem({ task }: ForgeTaskItemProps) {
  return (
    <li className="forge-task-item" data-status={task.status}>
      <span className="shrink-0">
        {task.status === "done" ? (
          <CheckCircle2 className="size-3.5 forge-animate-task-check" />
        ) : task.status === "active" ? (
          <Circle className="size-3.5 forge-task-icon--active" fill="currentColor" strokeWidth={0} />
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
