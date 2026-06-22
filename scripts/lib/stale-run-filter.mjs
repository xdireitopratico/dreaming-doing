/** Espelha shouldSkipStaleExpiry de agent-pending-queue.ts (chunk handoff). */
const CHUNK_HANDOFF_GAP_MS = 90 * 1000;

export function shouldSkipStaleExpiry({
  meta = {},
  lastEventType = null,
  lastEventAt = null,
  nowMs = Date.now(),
}) {
  const chunkHandoffGraceMs = CHUNK_HANDOFF_GAP_MS * 2;

  if (meta.betweenChunks === true) {
    const lastChunkAt = meta.lastChunkAt;
    if (!lastChunkAt) return true;
    const chunkAgeMs = nowMs - new Date(lastChunkAt).getTime();
    if (chunkAgeMs <= chunkHandoffGraceMs) return true;
  }

  if (lastEventType === "chunk_resume" && lastEventAt) {
    const chunkAgeMs = nowMs - new Date(lastEventAt).getTime();
    if (chunkAgeMs <= chunkHandoffGraceMs) return true;
  }

  return false;
}