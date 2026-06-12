export function normalizeNarrationKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function narrationParagraphs(buffer: string): string[] {
  return buffer
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Evita o mesmo parágrafo de narração acumular a cada step do loop. */
export function isDuplicateNarrationChunk(existingBuffer: string, newChunk: string): boolean {
  const chunk = newChunk.trim();
  if (!chunk) return true;

  const key = normalizeNarrationKey(chunk);
  if (key.length < 16) return false;

  for (const paragraph of narrationParagraphs(existingBuffer)) {
    if (normalizeNarrationKey(paragraph) === key) return true;
  }

  return false;
}