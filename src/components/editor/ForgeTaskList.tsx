import type { ForgeTaskItem as TaskItem } from "@/lib/forge-run";
import { ForgeTaskItem } from "@/components/editor/ForgeTaskItem";

type ForgeTaskListProps = {
  tasks: TaskItem[];
  maxVisible?: number;
};

export function ForgeTaskList({ tasks, maxVisible = 6 }: ForgeTaskListProps) {
  const visible = tasks.slice(0, maxVisible);
  if (!visible.length) return null;

  return (
    <ul className="lovable-job-mini-card-steps mt-2" data-testid="forge-task-list">
      {visible.map((task) => (
        <ForgeTaskItem key={task.id} task={task} />
      ))}
    </ul>
  );
}