export type StreamFrame = {
  event: string | null;
  data: string;
};

function normalizeChunk(chunk: string): string {
  return chunk.replace(/\r/g, "");
}

export async function consumeSseFrames(
  resp: Response,
  onFrame: (frame: StreamFrame) => void | Promise<void>,
): Promise<void> {
  const reader = resp.body?.getReader();
  if (!reader) {
    throw new Error("Stream indisponível na resposta do modelo");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const flushBlock = async (block: string): Promise<void> => {
    const lines = normalizeChunk(block).split("\n");
    let event: string | null = null;
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("event:")) {
        event = line.slice(6).trim() || null;
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) return;
    await onFrame({ event, data: dataLines.join("\n") });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = normalizeChunk(buffer);

    let idx = buffer.indexOf("\n\n");
    while (idx >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      await flushBlock(block);
      idx = buffer.indexOf("\n\n");
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const parts = tail.split("\n\n");
    for (const part of parts) {
      if (part.trim()) {
        await flushBlock(part);
      }
    }
  }
}

export async function consumeNdjsonFrames(
  resp: Response,
  onJson: (line: string) => void | Promise<void>,
): Promise<void> {
  const reader = resp.body?.getReader();
  if (!reader) {
    throw new Error("Stream indisponível na resposta do modelo");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = normalizeChunk(buffer);

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      await onJson(trimmed);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    for (const line of tail.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) await onJson(trimmed);
    }
  }
}

export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
