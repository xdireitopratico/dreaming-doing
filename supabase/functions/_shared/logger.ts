// logger.ts — Structured logger JSON para Edge Functions Deno
// Cada chamada emite uma linha JSON em stdout (Datadog/Sentry/Grafana conseguem parsear).
// correlationId é propagado via AsyncLocalStorage — não precisa passar manualmente.
import { AsyncLocalStorage } from "node:async_hooks";
const STORAGE = new AsyncLocalStorage<{ correlationId: string; runId?: string; userId?: string }>();

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = {
  correlationId?: string;
  runId?: string;
  userId?: string;
  [k: string]: unknown;
};

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj, (_k, v) => {
      if (v instanceof Error) {
        return { name: v.name, message: v.message, stack: v.stack };
      }
      return v;
    });
  } catch {
    return '{"_error":"circular or non-serializable"}';
  }
}

function emit(level: LogLevel, message: string, data?: LogContext) {
  const ctx = STORAGE.getStore() ?? {};
  const line = safeStringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...ctx,
    ...(data ?? {}),
  });
  const out = level === "error" || level === "warn" ? "stderr" : "stdout";
  if (out === "stderr") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, data?: LogContext) => emit("debug", msg, data),
  info: (msg: string, data?: LogContext) => emit("info", msg, data),
  warn: (msg: string, data?: LogContext) => emit("warn", msg, data),
  error: (msg: string, data?: LogContext) => emit("error", msg, data),
  /** Emite um evento tipado (ex: agent.phase_change, llm.retry) — útil pra filtros. */
  event: (event: string, data?: LogContext) =>
    emit("info", `event:${event}`, { event, ...(data ?? {}) }),
};

/** Roda `fn` com correlationId no escopo. Toda chamada de logger dentro carrega o ID. */
export function withCorrelationId<T>(
  correlationId: string,
  fn: () => T | Promise<T>,
  extra?: { runId?: string; userId?: string },
): T | Promise<T> {
  return STORAGE.run({ correlationId, ...extra }, fn);
}

/** Lê o correlationId atual (ou undefined se não estiver dentro de withCorrelationId). */
export function currentCorrelationId(): string | undefined {
  return STORAGE.getStore()?.correlationId;
}

/** Helper HTTP: extrai correlationId do header `X-Correlation-Id` ou gera um novo. */
export function correlationIdFromRequest(req: Request): string {
  return (
    req.headers.get("X-Correlation-Id")?.trim() ||
    req.headers.get("x-request-id")?.trim() ||
    crypto.randomUUID()
  );
}
