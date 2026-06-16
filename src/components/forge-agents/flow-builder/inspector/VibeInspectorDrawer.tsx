import { ThinkingStream } from './ThinkingStream';
import { ToolCallTimeline } from './ToolCallTimeline';
import { SessionHeader } from './SessionHeader';
import { ExportButton } from './ExportButton';

interface VibeInspectorDrawerProps {
  thinking: string;
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
  isConnected: boolean;
  error: string | null;
  exportSession: () => string;
  clearBuffers: () => void;
}

export function VibeInspectorDrawer({
  thinking,
  toolCalls,
  sessionInfo,
  isConnected,
  error,
  exportSession,
  clearBuffers,
}: VibeInspectorDrawerProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Inspector</h2>
        <div className="flex items-center gap-2">
          <ExportButton exportSession={exportSession} disabled={!isConnected} />
          <button
            onClick={clearBuffers}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Clear
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </div>
      ) : null}

      <SessionHeader sessionInfo={sessionInfo} />
      <ThinkingStream thinking={thinking} />
      <ToolCallTimeline toolCalls={toolCalls} />

      <div className="text-xs text-muted-foreground">
        {isConnected ? 'Conectado ao stream inspector' : 'Stream desconectado'}
      </div>
    </div>
  );
}