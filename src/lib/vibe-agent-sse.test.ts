import { describe, expect, it } from 'vitest';
import {
  encodeSseEvent,
  eventFromRow,
  isTerminalEvent,
  type PersistedEventRow,
} from '../../supabase/functions/_shared/vibe-agent-sse';

describe('vibe-agent-sse helpers', () => {
  it('encodes SSE data frames', () => {
    const frame = encodeSseEvent({ type: 'chat_intro', text: 'Olá' });
    expect(new TextDecoder().decode(frame)).toBe('data: {"type":"chat_intro","text":"Olá"}\n\n');
  });

  it('stops chat stream on closure and inspector stream on session_end', () => {
    expect(isTerminalEvent('chat', { type: 'chat_closure' })).toBe(true);
    expect(isTerminalEvent('chat', { type: 'chat_loop_step' })).toBe(false);
    expect(isTerminalEvent('inspector', { type: 'session_end' })).toBe(true);
    expect(isTerminalEvent('inspector', { type: 'thinking' })).toBe(false);
  });

  it('extracts event payload from persisted row', () => {
    const row = {
      id: 1,
      execution_id: 'execution-id',
      conversation_id: 'conversation-id',
      request_id: 'request-id',
      channel: 'chat' as const,
      event_type: 'chat_intro',
      event_data: { type: 'chat_intro', text: 'Olá' },
      sequence: 1,
      created_at: new Date().toISOString(),
    } satisfies PersistedEventRow;

    expect(eventFromRow(row)).toEqual({ type: 'chat_intro', text: 'Olá' });
  });
});
