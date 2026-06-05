/** C16 — backoff exponencial para erros retryable (429, 529, 503, conexão). */

export const MAX_LLM_RETRIES = 4;

export function llmBackoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec != null && retryAfterSec > 0) {
    return Math.min(60_000, retryAfterSec * 1000);
  }
  const base = 1000 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 400);
  return Math.min(30_000, base + jitter);
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}