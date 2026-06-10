import type { ForgeTaskItem as TaskItem } from "@/lib/forge-run";
import { ForgeTaskItem } from "@/components/editor/ForgeTaskItem";

type ForgeTaskListProps = {
  tasks: TaskItem[];
};

export function ForgeTaskList({ tasks }: ForgeTaskListProps) {
  if (!tasks.length) return null;

  return (
    <ul className="forge-task-list" data-testid="forge-task-list">
      {tasks.slice(0, 6).map((task) => (
        <ForgeTaskItem key={task.id} task={task} />
      ))}
    </ul>
  );
}