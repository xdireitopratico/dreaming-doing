import type { MinicardState } from '@/lib/vibe-agent-events';

interface MinicardLoopingProps {
  minicard: MinicardState;
}

export function MinicardLooping({ minicard }: MinicardLoopingProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
        <span className="text-sm font-medium">{minicard.title}</span>
      </div>
      <div className="space-y-1.5">
        {minicard.steps.map((step) => (
          <div key={step.id} className="flex items-center gap-2 text-xs">
            <StatusIcon status={step.status} />
            <span className={step.status === 'error' ? 'text-red-500' : ''}>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: MinicardState['steps'][number]['status'] }) {
  switch (status) {
    case 'running':
      return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />;
    case 'done':
      return <span className="h-1.5 w-1.5 rounded-full bg-green-500" />;
    case 'error':
      return <span className="h-1.5 w-1.5 rounded-full bg-red-500" />;
    default:
      return <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />;
  }
}