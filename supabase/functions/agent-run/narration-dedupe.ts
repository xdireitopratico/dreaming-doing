export const ENTENDI_OPENER_RE = /^entendi\b/i;

export function normalizeNarrationKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function narrationParagraphs(buffer: string): string[] {
  return buffer
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function isEntendiOpener(text: string): boolean {
  return ENTENDI_OPENER_RE.test(text.trim());
}

/** Evita o mesmo parágrafo de narração acumular a cada step do loop. */
export function isDuplicateNarrationChunk(existingBuffer: string, newChunk: string): boolean {
  const chunk = newChunk.trim();
  if (!chunk) return true;

  if (isEntendiOpener(chunk)) {
    for (const paragraph of narrationParagraphs(existingBuffer)) {
      if (isEntendiOpener(paragraph)) return true;
    }
  }

  const key = normalizeNarrationKey(chunk);
  if (key.length < 16) return false;

  for (const paragraph of narrationParagraphs(existingBuffer)) {
    if (normalizeNarrationKey(paragraph) === key) return true;
  }

  return false;
}

/** Colapsa parede de "Entendi…" no buffer persistido ou exibido. */
export function collapseNarrationBuffer(buffer: string): string {
  const paragraphs = narrationParagraphs(buffer);
  if (paragraphs.length === 0) return "";

  const out: string[] = [];
  let keptEntendi = false;

  for (const p of paragraphs) {
    if (isEntendiOpener(p)) {
      if (!keptEntendi) {
        keptEntendi = true;
        out.push(p);
      }
      continue;
    }
    out.push(p);
  }

  return out.join("\n\n");
}

/** Remove aberturas "Entendi…" da prosa do agente em passos de continuação do loop. */
export function filterLoopAgentProseForChat(
  prose: string,
  opts: { loopStep: number; skipAck?: boolean },
): string | null {
  const trimmed = prose.trim();
  if (!trimmed) return null;

  const stripAck = opts.skipAck === true || opts.loopStep > 1;
  if (!stripAck) return trimmed;

  const kept = narrationParagraphs(trimmed).filter((p) => !isEntendiOpener(p));
  if (kept.length === 0) return null;
  return kept.join("\n\n");
}