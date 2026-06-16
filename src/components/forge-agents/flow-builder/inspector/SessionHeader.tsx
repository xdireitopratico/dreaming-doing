interface SessionHeaderProps {
  sessionInfo: {
    sessionId: string;
    requestId: string;
    prompt: string;
    model: string;
    provider: string;
    startedAt: number;
    endedAt?: number;
    status: 'running' | 'success' | 'partial' | 'failed' | 'cancelled';
    totalDurationMs?: number;
    totalTokens?: { input: number; output: number };
  } | null;
}

export function SessionHeader({ sessionInfo }: SessionHeaderProps) {
  if (!sessionInfo) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        Aguardando sessão...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Session</span>
        <StatusBadge status={sessionInfo.status} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Model</dt>
          <dd>{sessionInfo.model}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Provider</dt>
          <dd>{sessionInfo.provider}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Duration</dt>
          <dd>{sessionInfo.totalDurationMs ? `${sessionInfo.totalDurationMs}ms` : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tokens</dt>
          <dd>
            {sessionInfo.totalTokens
              ? `${sessionInfo.totalTokens.input}→${sessionInfo.totalTokens.output}`
              : '—'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function StatusBadge({ status }: { status: 'running' | 'success' | 'partial' | 'failed' | 'cancelled' }) {
  const color = {
    running: 'bg-blue-500/10 text-blue-500',
    success: 'bg-green-500/10 text-green-500',
    partial: 'bg-yellow-500/10 text-yellow-500',
    failed: 'bg-red-500/10 text-red-500',
    cancelled: 'bg-gray-500/10 text-gray-500',
  }[status];

  return <span className={`rounded px-1.5 py-0.5 text-xs ${color}`}>{status}</span>;
}