/**
 * Thresholds alinhados com supabase/functions/_shared/agent-pending-queue.ts
 * (STALE_RUN_MS / QUEUE_STALE_RUN_MS).
 */
export const SERVER_STALE_RUN_MS = 8 * 60 * 1000;
export const SERVER_QUEUE_STALE_RUN_MS = 2 * 60 * 1000;

export function clientStaleStreamMs(pendingQueueCount: number): number {
  return pendingQueueCount > 0 ? SERVER_QUEUE_STALE_RUN_MS : SERVER_STALE_RUN_MS;
}