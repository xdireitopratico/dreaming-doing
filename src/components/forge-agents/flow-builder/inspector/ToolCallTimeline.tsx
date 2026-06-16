import { useState } from 'react';

interface ToolCallTimelineProps {
  toolCalls: Array<{
    callId: string;
    tool: string;
    input: Record<string, unknown>;
    output?: Record<string, unknown>;
    status: 'start' | 'complete' | 'error';
    durationMs?: number;
    error?: string;
    timestamp: number;
    sequence: number;
  }>;
}

export function ToolCallTimeline({ toolCalls }: ToolCallTimelineProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (toolCalls.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        Aguardando tool calls...
      </div>
    );
  }

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {toolCalls.map((call) => {
        const isExpanded = expanded.has(call.callId);

        return (
          <div key={call.callId} className="rounded-lg border border-border bg-muted/30 p-2">
            <button
              onClick={() => toggle(call.callId)}
              className="flex w-full items-center gap-2 text-left text-xs"
            >
              <StatusBadge status={call.status} />
              <span className="font-medium">{call.tool}</span>
              {call.durationMs ? (
                <span className="text-muted-foreground">({call.durationMs}ms)</span>
              ) : null}
            </button>

            {isExpanded ? (
              <div className="mt-2 space-y-1 text-xs">
                <div>
                  <strong>Input:</strong>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-background p-2">
                    {JSON.stringify(call.input, null, 2)}
                  </pre>
                </div>
                {call.output ? (
                  <div>
                    <strong>Output:</strong>
                    <pre className="mt-1 whitespace-pre-wrap rounded bg-background p-2">
                      {JSON.stringify(call.output, null, 2)}
                    </pre>
                  </div>
                ) : null}
                {call.error ? (
                  <div className="text-red-500">
                    <strong>Error:</strong> {call.error}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: 'start' | 'complete' | 'error' }) {
  switch (status) {
    case 'start':
      return <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-500">start</span>;
    case 'complete':
      return <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-green-500">done</span>;
    case 'error':
      return <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-500">error</span>;
  }
}