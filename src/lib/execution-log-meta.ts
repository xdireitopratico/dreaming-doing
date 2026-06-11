/** Espelho testável de supabase/functions/agent-run/executionLogMeta.ts (C15). */

export const MAX_EXECUTION_LOG_ENTRIES = 40;

export function appendExecutionLogEntry(existing: string[], entry: string): string[] {
  const next = [...existing, entry];
  if (next.length <= MAX_EXECUTION_LOG_ENTRIES) return next;
  return next.slice(-MAX_EXECUTION_LOG_ENTRIES);
}

export function buildExecutionLogMeta(
  existingMeta: Record<string, unknown> | null | undefined,
  executionLog: string[],
  step: number,
): Record<string, unknown> {
  const base = existingMeta && typeof existingMeta === "object" ? { ...existingMeta } : {};
  return {
    ...base,
    executionLog,
    lastStep: step,
    updatedAt: new Date().toISOString(),
  };
}

export function restoreExecutionLogFromRows(
  rows: Array<{ meta?: Record<string, unknown> | null }>,
): string[] {
  for (let i = rows.length - 1; i >= 0; i--) {
    const raw = rows[i]?.meta;
    if (!raw || typeof raw !== "object") continue;
    const log = (raw as { executionLog?: unknown }).executionLog;
    if (Array.isArray(log) && log.every((e) => typeof e === "string")) {
      return log.slice(-MAX_EXECUTION_LOG_ENTRIES);
    }
  }
  return [];
}
