import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { TaskItem } from "@/lib/chat/types";

type ChatTaskListProps = {
  tasks: TaskItem[];
};

export function ChatTaskList({ tasks }: ChatTaskListProps) {
  if (!tasks.length) return null;

  return (
    <ul className="forge-task-list" data-testid="chat-task-list">
      {tasks.slice(0, 6).map((task) => (
        <li key={task.id} className="forge-task-item" data-status={task.status}>
          <span className="forge-task-icon shrink-0" aria-hidden>
            {task.status === "done" ? (
              <CheckCircle2 className="size-3.5 forge-animate-task-check" />
            ) : task.status === "active" ? (
              <Circle className="size-3.5 forge-task-icon--active" fill="currentColor" strokeWidth={0} />
            ) : task.status === "failed" ? (
              <XCircle className="size-3.5" />
            ) : (
              <Circle className="size-3.5" strokeWidth={1.75} />
            )}
          </span>
          <span className="forge-task-label min-w-0">{task.label}</span>
        </li>
      ))}
    </ul>
  );
}