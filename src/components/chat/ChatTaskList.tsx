import { CheckCircle2, Loader2, XCircle, Circle } from "lucide-react";
import type { TaskItem } from "@/lib-v2/chat-types";

type ChatTaskListProps = {
  tasks: TaskItem[];
};

export function ChatTaskList({ tasks }: ChatTaskListProps) {
  if (!tasks.length) return null;

  const icon = (status: TaskItem["status"]) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="size-3.5 text-emerald-500 forge-animate-task-check" />;
      case "active":
        return <Loader2 className="size-3.5 animate-spin" />;
      case "failed":
        return <XCircle className="size-3.5 text-red-500" />;
      default:
        return <Circle className="size-3.5 opacity-40" />;
    }
  };

  return (
    <ul className="forge-task-list">
      {tasks.slice(0, 6).map((task) => (
        <li key={task.id} className="forge-task-item">
          {icon(task.status)}
          <span className="forge-task-label">{task.label}</span>
        </li>
      ))}
    </ul>
  );
}
