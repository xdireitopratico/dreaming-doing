// ============================================================================
// VIBE AGENT CORE — Cliente zero-React para comunicação com Edge Function
// ============================================================================

import type { 
  ChatEvent, InspectorEvent, FlowPatch, FlowVersion, 
  Conversation, CuratedMessage 
} from './vibe-agent-events';

const EDGE_BASE = '/functions/v1/vibe-agent-chat';

interface StreamOptions {
  signal?: AbortSignal;
  onError?: (error: Error) => void;
  maxRetries?: number;
  baseRetryDelayMs?: number;
  cursor?: string;
}

interface SendMessageOptions {
  idempotencyKey?: string;
  model?: string;
  provider?: string;
  signal?: AbortSignal;
}

interface SendMessageResult {
  chatStream: AsyncIterable<ChatEvent>;
  inspectorStream: AsyncIterable<InspectorEvent>;
  chatStreamId: string;
  inspectorStreamId: string;
}

/**
 * Cliente singleton para comunicação com Vibe Agent.
 * Zero dependências React — pura lógica de rede, retry, idempotência.
 */
class VibeAgentCore {
  private chatControllers = new Map<string, AbortController>();
  private inspectorControllers = new Map<string, AbortController>();
  private eventBuffers = new Map<string, InspectorEvent[]>();
  private readonly MAX_BUFFER_SIZE = 500;

  // ---------------------------------------------------------------------------
  // CHAT STREAM — Consome eventos curados para UI de conversa
  // ---------------------------------------------------------------------------
  async *subscribeChat(conversationId: string, opts: StreamOptions = {}): AsyncGenerator<ChatEvent> {
    const controller = new AbortController();
    this.chatControllers.set(conversationId, controller);
    
    const signal = opts.signal ?? controller.signal;
    let retryCount = 0;
    const maxRetries = opts.maxRetries ?? 3;
    const baseDelay = opts.baseRetryDelayMs ?? 1000;
    let lastCursor = opts.cursor;
    let eventsSinceCursor = 0;
    
    while (!signal.aborted) {
      try {
        const url = new URL(`${EDGE_BASE}/stream/chat`);
        url.searchParams.set('conversation_id', conversationId);
        if (lastCursor) url.searchParams.set('cursor', lastCursor);
        
        const response = await fetch(url, { 
          signal,
          headers: { 
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache'
          }
        });
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        if (!response.body) throw new Error('Empty response body');
        
        retryCount = 0; // reset on successful connection
        
        for await (const event of this.parseSSE<ChatEvent>(response.body, signal)) {
          if (event.type === 'checkpoint') {
            lastCursor = event.cursor;
            eventsSinceCursor = event.eventsSoFar;
          }
          yield event;
        }
        
        // Stream ended normally (connection closed by server)
        break;
        
      } catch (err) {
        if (signal.aborted) break;
        if (err instanceof DOMException && err.name === 'AbortError') break;
        
        retryCount++;
        if (retryCount > maxRetries) {
          opts.onError?.(err as Error);
          throw err;
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, retryCount - 1) + Math.random() * 500;
        await this.sleep(delay);
      }
    }
    
    this.chatControllers.delete(conversationId);
  }

  // ---------------------------------------------------------------------------
  // INSPECTOR STREAM — Consome eventos completos para debug/auditoria
  // ---------------------------------------------------------------------------
  async *subscribeInspector(conversationId: string, opts: StreamOptions = {}): AsyncGenerator<InspectorEvent> {
    const controller = new AbortController();
    this.inspectorControllers.set(conversationId, controller);
    
    const signal = opts.signal ?? controller.signal;
    let retryCount = 0;
    const maxRetries = opts.maxRetries ?? 3;
    const baseDelay = opts.baseRetryDelayMs ?? 1000;
    let lastCursor = opts.cursor;
    
    while (!signal.aborted) {
      try {
        const url = new URL(`${EDGE_BASE}/stream/inspector`);
        url.searchParams.set('conversation_id', conversationId);
        if (lastCursor) url.searchParams.set('cursor', lastCursor);
        
        const response = await fetch(url, { 
          signal,
          headers: { 
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache'
          }
        });
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        if (!response.body) throw new Error('Empty response body');
        
        retryCount = 0;
        
        for await (const event of this.parseSSE<InspectorEvent>(response.body, signal)) {
          if (event.type === 'checkpoint') {
            lastCursor = event.cursor;
          }
          // Buffer para export/replay
          this.bufferEvent(conversationId, event);
          yield event;
        }
        
        break;
        
      } catch (err) {
        if (signal.aborted) break;
        if (err instanceof DOMException && err.name === 'AbortError') break;
        
        retryCount++;
        if (retryCount > maxRetries) {
          opts.onError?.(err as Error);
          throw err;
        }
        
        const delay = baseDelay * Math.pow(2, retryCount - 1) + Math.random() * 500;
        await this.sleep(delay);
      }
    }
    
    this.inspectorControllers.delete(conversationId);
  }

  // ---------------------------------------------------------------------------
  // SEND MESSAGE — Inicia execução, retorna ambos os streams
  // ---------------------------------------------------------------------------
  async sendMessage(
    conversationId: string, 
    text: string, 
    options: SendMessageOptions = {}
  ): Promise<SendMessageResult> {
    const idempotencyKey = options.idempotencyKey ?? crypto.randomUUID();
    
    const response = await fetch(`${EDGE_BASE}/execute`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey 
      },
      body: JSON.stringify({ 
        conversation_id: conversationId, 
        message: text,
        model: options.model,
        provider: options.provider
      }),
      signal: options.signal
    });
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      throw new Error(err.message || `HTTP ${response.status}`);
    }
    
    const { chat_stream_id, inspector_stream_id } = await response.json();
    
    return {
      chatStream: this.subscribeChat(chat_stream_id),
      inspectorStream: this.subscribeInspector(inspector_stream_id),
      chatStreamId: chat_stream_id,
      inspectorStreamId: inspector_stream_id
    };
  }

  // ---------------------------------------------------------------------------
  // FLOW VERSIONING & UNDO
  // ---------------------------------------------------------------------------
  async applyPatch(conversationId: string, patch: FlowPatch): Promise<FlowVersion> {
    const response = await fetch(`${EDGE_BASE}/apply-patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, patch })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to apply patch');
    }
    return response.json();
  }
  
  async getHistory(conversationId: string): Promise<FlowVersion[]> {
    const response = await fetch(`${EDGE_BASE}/history?conversation_id=${encodeURIComponent(conversationId)}`);
    if (!response.ok) throw new Error('Failed to fetch history');
    return response.json();
  }
  
  async undo(conversationId: string, versionId: string): Promise<FlowVersion> {
    const response = await fetch(`${EDGE_BASE}/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, version_id: versionId })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to undo');
    }
    return response.json();
  }

  // ---------------------------------------------------------------------------
  // CONVERSATION MANAGEMENT
  // ---------------------------------------------------------------------------
  async createConversation(flowId: string): Promise<string> {
    const response = await fetch(`${EDGE_BASE}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flow_id: flowId })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create conversation');
    }
    const { conversation_id } = await response.json();
    return conversation_id;
  }
  
  async listConversations(flowId: string): Promise<Conversation[]> {
    const response = await fetch(`${EDGE_BASE}/conversations?flow_id=${encodeURIComponent(flowId)}`);
    if (!response.ok) throw new Error('Failed to list conversations');
    return response.json();
  }

  // ---------------------------------------------------------------------------
  // CONTROL
  // ---------------------------------------------------------------------------
  stopChat(conversationId: string) {
    this.chatControllers.get(conversationId)?.abort();
    this.chatControllers.delete(conversationId);
  }
  
  stopInspector(conversationId: string) {
    this.inspectorControllers.get(conversationId)?.abort();
    this.inspectorControllers.delete(conversationId);
  }
  
  stopAll(conversationId: string) {
    this.stopChat(conversationId);
    this.stopInspector(conversationId);
  }

  // ---------------------------------------------------------------------------
  // BUFFER MANAGEMENT (Inspector)
  // ---------------------------------------------------------------------------
  private bufferEvent(conversationId: string, event: InspectorEvent) {
    const buf = this.eventBuffers.get(conversationId) || [];
    buf.push(event);
    if (buf.length > this.MAX_BUFFER_SIZE) buf.shift();
    this.eventBuffers.set(conversationId, buf);
  }
  
  getBufferedEvents(conversationId: string): InspectorEvent[] {
    return [...(this.eventBuffers.get(conversationId) || [])];
  }
  
  exportSession(conversationId: string): string {
    return JSON.stringify(this.getBufferedEvents(conversationId), null, 2);
  }
  
  clearBuffer(conversationId: string) {
    this.eventBuffers.delete(conversationId);
  }

  // ---------------------------------------------------------------------------
  // UTILITIES
  // ---------------------------------------------------------------------------
  private async *parseSSE<T>(body: ReadableStream, signal: AbortSignal): AsyncGenerator<T> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';
        
        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                yield JSON.parse(line.slice(6)) as T;
              } catch {
                // Ignore parse errors - malformed SSE chunk
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton export
export const vibeAgent = new VibeAgentCore();

// Named exports for testing
export { VibeAgentCore };
export type { StreamOptions, SendMessageOptions, SendMessageResult };