import type { AtomicPlan } from '@/lib/vibe-agent-events';

interface AtomicPlanChecklistProps {
  plan: AtomicPlan;
}

export function AtomicPlanChecklist({ plan }: AtomicPlanChecklistProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <h3 className="mb-3 text-sm font-medium">{plan.title}</h3>
      <div className="space-y-2">
        {plan.tasks.map((task) => (
          <div key={task.id} className="flex items-start gap-2 text-xs">
            <Checkbox status={task.status} />
            <div>
              <div className="font-medium">{task.label}</div>
              {task.dependsOn?.length ? (
                <div className="mt-0.5 text-muted-foreground">
                  Depende: {task.dependsOn.join(', ')}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Checkbox({ status }: { status: AtomicPlan['tasks'][number]['status'] }) {
  switch (status) {
    case 'done':
      return <span className="mt-0.5 text-green-500">✓</span>;
    case 'running':
      return <span className="mt-0.5 text-blue-500 animate-pulse">…</span>;
    case 'error':
      return <span className="mt-0.5 text-red-500">!</span>;
    default:
      return <span className="mt-0.5 text-muted-foreground">○</span>;
  }
}