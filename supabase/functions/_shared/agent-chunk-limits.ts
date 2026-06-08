/**
 * Limites globais do ciclo resumable → re-enqueue para evitar runs "zumbis".
 */
export const MAX_CHUNK_GENERATIONS = 12;
export const MAX_RUN_WALL_MS = 45 * 60 * 1000;
/** Gap sem eventos após checkpoint = run entre chunks (não bloqueia fila). */
export const CHUNK_HANDOFF_GAP_MS = 90 * 1000;

export type ChunkLimitDecision = {
  exceeded: boolean;
  reason?: "chunk_cap" | "wall_clock";
  chunkGeneration: number;
};

export function evaluateChunkLimits(
  meta: Record<string, unknown>,
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
): ChunkLimitDecision {
  const prev = typeof meta.chunkGeneration === "number" ? meta.chunkGeneration : 0;
  const chunkGeneration = prev + 1;
  if (chunkGeneration > MAX_CHUNK_GENERATIONS) {
    return { exceeded: true, reason: "chunk_cap", chunkGeneration };
  }
  if (startedAt) {
    const wallMs = nowMs - new Date(startedAt).getTime();
    if (wallMs > MAX_RUN_WALL_MS) {
      return { exceeded: true, reason: "wall_clock", chunkGeneration };
    }
  }
  return { exceeded: false, chunkGeneration };
}

export function chunkCapErrorMessage(reason: ChunkLimitDecision["reason"]): string {
  if (reason === "wall_clock") {
    return "Execução atingiu o tempo máximo (~45 min). Envie outra mensagem para continuar.";
  }
  return "Execução atingiu o limite de retomadas automáticas. Envie outra mensagem para continuar.";
}