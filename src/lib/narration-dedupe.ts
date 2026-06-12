/** Espelho testável de supabase/functions/agent-run/narration-dedupe.ts */

export function normalizeNarrationKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function narrationParagraphs(buffer: string): string[] {
  return buffer
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Evita acumular o mesmo parágrafo de narração a cada step do loop
 * (ex.: «Entendi: vou ler o arquivo…» repetido 10× no chat).
 */
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