/**
 * Terminal honesty helpers for smoke-agent-e2e (Fase S.5).
 * Exported for node --test coverage.
 */

/** Run emitiu progresso além de start/heartbeat. */
export function isRichProgress(types) {
  return types.some(
    (t) =>
      t === "phase" ||
      t === "classify" ||
      t === "assistant_text" ||
      t === "text_delta" ||
      t.startsWith("tool_") ||
      t === "fsm_transition" ||
      t === "explore" ||
      t === "chunk_resume",
  );
}

/**
 * Terminal honesto:
 * - chunk_resume: handoff resumable (run pode seguir running)
 * - completed/awaiting_user: exige finish ou done + progresso rico
 * - failed: exige finish (erro explícito no poll loop cobre o resto)
 * - running/pending sozinhos: nunca passam
 */
export function isTerminalHonest(types, status) {
  if (!Array.isArray(types) || types.length === 0) return false;

  if (types.includes("chunk_resume")) {
    return true;
  }

  if (status === "running" || status === "pending") {
    return false;
  }

  if (status === "completed" || status === "awaiting_user") {
    const hasTerminalEvent = types.includes("finish") || types.includes("done");
    return hasTerminalEvent && isRichProgress(types);
  }

  if (status === "failed") {
    return types.includes("finish");
  }

  return false;
}