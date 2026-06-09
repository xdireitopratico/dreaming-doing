/**
 * Limites globais do ciclo resumable → re-enqueue para evitar runs "zumbis".
 */
export const MAX_CHUNK_GENERATIONS = 12;
export const MAX_BUILD_FIX_ATTEMPTS = 8;
export const MAX_RUN_WALL_MS = 45 * 60 * 1000;
/** Gap sem eventos após checkpoint = run entre chunks (não bloqueia fila). */
export const CHUNK_HANDOFF_GAP_MS = 90 * 1000;

export type ChunkLimitDecision = {
  exceeded: boolean;
  reason?: "chunk_cap" | "wall_clock" | "build_fix_cap";
  chunkGeneration: number;
  buildFixAttempts?: number;
  buildFixResume?: boolean;
};

export function evaluateBuildFixLimits(meta: Record<string, unknown>): {
  exceeded: boolean;
  buildFixAttempts: number;
} {
  const prev = typeof meta.buildFixAttempts === "number" ? meta.buildFixAttempts : 0;
  const buildFixAttempts = prev + 1;
  return {
    exceeded: buildFixAttempts > MAX_BUILD_FIX_ATTEMPTS,
    buildFixAttempts,
  };
}

export function evaluateChunkLimits(
  meta: Record<string, unknown>,
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
  options?: { buildFix?: boolean },
): ChunkLimitDecision {
  const buildFixResume = options?.buildFix === true || meta.buildFix === true;

  if (buildFixResume) {
    const fixLimits = evaluateBuildFixLimits(meta);
    if (fixLimits.exceeded) {
      return {
        exceeded: true,
        reason: "build_fix_cap",
        chunkGeneration: typeof meta.chunkGeneration === "number" ? meta.chunkGeneration : 0,
        buildFixAttempts: fixLimits.buildFixAttempts,
        buildFixResume: true,
      };
    }
    const prevGen = typeof meta.chunkGeneration === "number" ? meta.chunkGeneration : 0;
    return {
      exceeded: false,
      chunkGeneration: prevGen,
      buildFixAttempts: fixLimits.buildFixAttempts,
      buildFixResume: true,
    };
  }

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
  if (reason === "build_fix_cap") {
    return "Build ainda com erros após várias tentativas automáticas de correção. Envie outra mensagem para continuar.";
  }
  return "Execução atingiu o limite de retomadas automáticas. Envie outra mensagem para continuar.";
}