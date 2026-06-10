import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ForgeTaskItem as TaskItem } from "@/lib/forge-run";

type ForgeTaskItemProps = {
  task: TaskItem;
};

export function ForgeTaskItem({ task }: ForgeTaskItemProps) {
  return (
    <li
      className={cn(
        "forge-task-item flex items-center gap-2 text-[length:var(--font-task)]",
        task.status === "done" && "text-[var(--status-done)]",
        task.status === "active" && "text-[var(--status-working)]",
        task.status === "failed" && "text-[var(--status-failed)]",
        task.status === "pending" && "text-[var(--status-pending)]",
      )}
      data-status={task.status}
    >
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