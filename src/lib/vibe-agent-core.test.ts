import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VibeAgentCore } from './vibe-agent-core';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe('VibeAgentCore persistent streams', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'http://localhost' } },
      configurable: true,
    });
  });

  it('subscribes to chat using execution_id returned by sendMessage', async () => {
    const executeResponse = {
      ok: true,
      json: async () => ({
        execution_id: 'execution-id',
        chat_stream_id: 'execution-id',
        inspector_stream_id: 'execution-id',
      }),
    };

    const streamResponse = {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"chat_intro","text":"Olá","timestamp":1,"requestId":"request-id"}\n\n'));
          controller.close();
        },
      }),
    };

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(executeResponse)
      .mockResolvedValueOnce(streamResponse);

    const core = new VibeAgentCore();
    const { chatStream, executionId } = await core.sendMessage('conversation-id', 'teste');
    const first = await chatStream[Symbol.asyncIterator]().next();

    expect(executionId).toBe('execution-id');
    expect(first.value.type).toBe('chat_intro');

    const subscribeUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0] as URL;
    expect(subscribeUrl.toString()).toBe('http://localhost/functions/v1/vibe-agent-chat/stream/chat?execution_id=execution-id');
  });

  it('exports persisted inspector events from /events endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [{ type: 'thinking', content: 'pensando' }],
    });

    const core = new VibeAgentCore();
    const json = await core.exportSession('conversation-id');

    expect(json).toContain('pensando');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/functions/v1/vibe-agent-chat/events?conversation_id=conversation-id&channel=inspector&limit=1000',
    );
  });
});
