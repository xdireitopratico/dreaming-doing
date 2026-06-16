// ============================================================================
// useVibeInspector — Hook para consumo completo da sessão (thinking + tool calls)
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { vibeAgent } from '@/lib/vibe-agent-core';
import type { InspectorEvent } from '@/lib/vibe-agent-events';

interface UseVibeInspectorOptions {
  conversationId: string | null;
  enabled: boolean;
  maxEvents?: number;
}

export function useVibeInspector({
  conversationId,
  enabled,
  maxEvents = 500,
}: UseVibeInspectorOptions) {
  const [thinking, setThinking] = useState<string>('');
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);

  // ---------------------------------------------------------------------------
  // TOOL CALL NORMALIZATION
  // ---------------------------------------------------------------------------
  const normalizeToolCall = useCallback((event: InspectorEvent): ToolCall | null => {
    if (event.type !== 'tool_call') return null;

    return {
      callId: event.callId,
      tool: event.tool,
      input: event.input,
      output: event.output,
      status: event.status,
      durationMs: event.durationMs,
      error: event.error,
      timestamp: event.timestamp,
      sequence: event.sequence,
    };
  }, []);

  // ---------------------------------------------------------------------------
  // SUBSCRIBE
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled || !conversationId) return;

    abortRef.current = new AbortController();
    setIsConnected(true);
    setError(null);
    sequenceRef.current = 0;

    (async () => {
      try {
        const controller = abortRef.current;
        if (!controller) return;

        for await (const event of vibeAgent.subscribeInspector(conversationId, {
          signal: controller.signal,
          onError: (err) => setError(err.message),
        })) {
          if ('sequence' in event) {
            sequenceRef.current = Math.max(sequenceRef.current, event.sequence);
          }

          switch (event.type) {
            case 'thinking':
              setThinking((prev) => prev + event.content);
              break;

            case 'tool_call': {
              const toolCall = normalizeToolCall(event);
              if (toolCall) {
                setToolCalls((prev) => {
                  const next = [...prev, toolCall];
                  return next.slice(-maxEvents);
                });
              }
              break;
            }

            case 'reasoning':
              setThinking((prev) => prev + `\n[REASONING] ${event.content}\n`);
              break;

            case 'session_start':
              setSessionInfo({
                sessionId: event.sessionId,
                requestId: event.requestId,
                prompt: event.prompt,
                model: event.model,
                provider: event.provider,
                startedAt: event.timestamp,
                status: 'running',
              });
              setThinking('');
              setToolCalls([]);
              break;

            case 'session_end':
              setSessionInfo((prev) => prev ? {
                ...prev,
                status: event.outcome,
                endedAt: event.timestamp,
                totalDurationMs: event.totalDurationMs,
                totalTokens: event.totalTokens,
              } : null);
              setIsConnected(false);
              break;

            case 'checkpoint':
              // Ignorado no inspector — usado apenas para replay
              break;
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;

        setError(err instanceof Error ? err.message : 'Inspector connection failed');
        setIsConnected(false);
      }
    })();

    return () => {
      abortRef.current?.abort();
      setIsConnected(false);
    };
  }, [conversationId, enabled, maxEvents, normalizeToolCall]);

  // ---------------------------------------------------------------------------
  // EXPORT / DEBUG
  // ---------------------------------------------------------------------------
  const exportSession = useCallback(() => {
    if (!conversationId) return '';
    return vibeAgent.exportSession(conversationId);
  }, [conversationId]);

  const clearBuffers = useCallback(() => {
    setThinking('');
    setToolCalls([]);
    setSessionInfo(null);
  }, []);

  // ---------------------------------------------------------------------------
  // FILTERED VIEWS
  // ---------------------------------------------------------------------------
  const getToolCallsByType = useCallback((tool: ToolCall['tool']) => {
    return toolCalls.filter((t) => t.tool === tool);
  }, [toolCalls]);

  const getErrors = useCallback(() => {
    return toolCalls.filter((t) => t.status === 'error');
  }, [toolCalls]);

  const getTimeline = useCallback(() => {
    return [
      ...toolCalls.map((t) => ({ type: 'tool_call' as const, ...t, timestamp: t.timestamp })),
      { type: 'thinking' as const, content: thinking, timestamp: Date.now() },
    ].sort((a, b) => a.timestamp - b.timestamp);
  }, [toolCalls, thinking]);

  return {
    thinking,
    toolCalls,
    sessionInfo,
    isConnected,
    error,
    exportSession,
    clearBuffers,
    getToolCallsByType,
    getErrors,
    getTimeline,
  };
}

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
interface SessionInfo {
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
}

interface ToolCall {
  callId: string;
  tool: 'read' | 'search' | 'edit' | 'bash' | 'grep' | 'list' | 'patch' | 'llm_call' | 'db_query' | 'web_search' | 'reasoning';
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: 'start' | 'complete' | 'error';
  durationMs?: number;
  error?: string;
  timestamp: number;
  sequence: number;
}