// ============================================================================
// VIBE AGENT SSE — DB-backed persistent streaming helpers
// ============================================================================

export type VibeChannel = 'chat' | 'inspector';

export interface PersistedEventRow {
  id: number;
  execution_id: string;
  conversation_id: string;
  request_id: string;
  channel: VibeChannel;
  event_type: string;
  event_data: Record<string, unknown>;
  payload?: Record<string, unknown> | null;
  sequence: number;
  created_at: string;
}

export interface ExecutionRow {
  id: string;
  conversation_id: string;
  request_id: string;
  status: string;
  started_at?: string;
  completed_at?: string;
}

export interface SseStreamOptions {
  pollMs?: number;
  idleTimeoutMs?: number;
  signal?: AbortSignal;
}

const encoder = new TextEncoder();

export function encodeSseEvent(event: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function isTerminalEvent(channel: VibeChannel, event: Record<string, unknown>): boolean {
  if (channel === 'inspector') {
    return event.type === 'session_end' || event.type === 'chat_error';
  }

  return event.type === 'chat_closure' || event.type === 'chat_error';
}

export function eventFromRow(row: PersistedEventRow): Record<string, unknown> {
  return (row.event_data || row.payload || {}) as Record<string, unknown>;
}

export async function fetchExecution(
  sb: ReturnType<any>,
  executionId: string,
): Promise<ExecutionRow | null> {
  const { data, error } = await (sb.from('agent_executions' as any) as any)
    .select('id, conversation_id, request_id, status, started_at, completed_at')
    .eq('id', executionId)
    .single();

  if (error || !data) return null;
  return data as ExecutionRow;
}

export async function fetchPersistedEvents(
  sb: ReturnType<any>,
  channel: VibeChannel,
  executionId: string,
  cursor?: string,
): Promise<PersistedEventRow[]> {
  let query = (sb.from('vibe_agent_events' as any) as any)
    .select('id, execution_id, conversation_id, request_id, channel, event_type, event_data, payload, sequence, created_at')
    .eq('execution_id', executionId)
    .eq('channel', channel)
    .order('id', { ascending: true })
    .limit(500);

  if (cursor) {
    const cursorId = Number(cursor);
    if (!Number.isNaN(cursorId)) {
      query = query.gt('id', cursorId);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch ${channel} events: ${error.message}`);
  return (data || []) as PersistedEventRow[];
}

export async function fetchConversationEvents(
  sb: ReturnType<any>,
  conversationId: string,
  channel: VibeChannel,
  limit = 500,
): Promise<PersistedEventRow[]> {
  const { data, error } = await (sb.from('vibe_agent_events' as any) as any)
    .select('id, execution_id, conversation_id, request_id, channel, event_type, event_data, payload, sequence, created_at')
    .eq('conversation_id', conversationId)
    .eq('channel', channel)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch ${channel} events: ${error.message}`);
  return (data || []) as PersistedEventRow[];
}

export async function createPersistentSseReadable(
  sb: ReturnType<any>,
  channel: VibeChannel,
  executionId: string,
  cursor?: string,
  options: SseStreamOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  const pollMs = options.pollMs ?? 750;
  const idleTimeoutMs = options.idleTimeoutMs ?? 10 * 60 * 1000;
  const startedAt = Date.now();
  let lastCursor = cursor;
  let eventsSinceCursor = 0;
  let requestId = '';

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (!options.signal?.aborted && Date.now() - startedAt < idleTimeoutMs) {
          const rows = await fetchPersistedEvents(sb, channel, executionId, lastCursor);

          for (const row of rows) {
            if (!requestId) requestId = row.request_id;
            const event = eventFromRow(row);
            controller.enqueue(encodeSseEvent(event));
            lastCursor = String(row.id);
            eventsSinceCursor += 1;

            if (isTerminalEvent(channel, event)) {
              controller.enqueue(encodeSseEvent({
                type: 'checkpoint',
                cursor: lastCursor,
                eventsSoFar: eventsSinceCursor,
                timestamp: Date.now(),
                requestId,
              }));
              controller.close();
              return;
            }
          }

          if (!requestId) {
            const execution = await fetchExecution(sb, executionId);
            requestId = execution?.request_id || '';
          }

          controller.enqueue(encodeSseEvent({
            type: 'checkpoint',
            cursor: lastCursor || '0',
            eventsSoFar: eventsSinceCursor,
            timestamp: Date.now(),
            requestId,
          }));

          await sleep(pollMs);
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      // ReadableStream cancellation is handled by the Edge runtime.
    },
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
