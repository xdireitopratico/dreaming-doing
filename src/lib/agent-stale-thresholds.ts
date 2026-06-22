/**
 * Thresholds alinhados com supabase/functions/_shared/agent-pending-queue.ts
 * (STALE_RUN_MS / QUEUE_STALE_RUN_MS).
 *
 * H8 fix: aumentado SERVER_STALE_RUN_MS de 8min → 10min e
 * SERVER_QUEUE_STALE_RUN_MS de 2min → 5min. Alinhado com o heartbeat
 * do servidor (30s) e o tempo máximo de observe() (~5min em sandbox
 * frio com npm install + build + tsc). Evita falso "zumbi" no cliente
 * quando o agente está vivo processando build longo.
 */
export const SERVER_STALE_RUN_MS = 10 * 60 * 1000;
export const SERVER_QUEUE_STALE_RUN_MS = 5 * 60 * 1000;

export function clientStaleStreamMs(pendingQueueCount: number): number {
  return pendingQueueCount > 0 ? SERVER_QUEUE_STALE_RUN_MS : SERVER_STALE_RUN_MS;
}
