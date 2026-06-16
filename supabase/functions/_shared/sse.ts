// ============================================================================
// SSE HELPER — Server-Sent Events streams for dual-channel communication
// ============================================================================

export interface SSEEvent<T = unknown> {
  type: string;
  data: T;
  timestamp: number;
  requestId: string;
  sequence?: number;
}

/**
 * Creates a paired readable/writable SSE stream.
 * The writable side is used by the agent loop to emit events.
 * The readable side is returned to the client via HTTP response.
 */
export function createSSEStream<T extends SSEEvent = SSEEvent>(): {
  readable: ReadableStream<T>;
  writable: WritableStreamDefaultWriter<T>;
} {
  let writer: WritableStreamDefaultWriter<T>;
  
  const readable = new ReadableStream<T>({
    start(controller) {
      writer = controller as unknown as WritableStreamDefaultWriter<T>;
    },
    cancel() {
      // Client disconnected
    }
  });
  
  return { readable, writable: writer! };
}

/**
 * Formats an event as SSE data line.
 */
export function formatSSE<T>(event: T): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Creates a writable stream that formats events as SSE and writes to underlying writer.
 */
export function createSSEWriter<T extends SSEEvent>(
  underlyingWriter: WritableStreamDefaultWriter<Uint8Array>
): WritableStreamDefaultWriter<T> {
  const encoder = new TextEncoder();
  
  return {
    write(event: T) {
      return underlyingWriter.write(encoder.encode(formatSSE(event)));
    },
    close() {
      return underlyingWriter.close();
    },
    abort(reason) {
      return underlyingWriter.abort(reason);
    },
    get ready() {
      return underlyingWriter.ready;
    },
    get desiredSize() {
      return underlyingWriter.desiredSize;
    }
  } as WritableStreamDefaultWriter<T>;
}

/**
 * Creates a TransformStream that converts objects to SSE format.
 */
export function createSSETransformStream<T extends SSEEvent>(): TransformStream<T, Uint8Array> {
  const encoder = new TextEncoder();
  
  return new TransformStream<T, Uint8Array>({
    transform(event, controller) {
      controller.enqueue(encoder.encode(formatSSE(event)));
    }
  });
}