/** Teto cooperativo da invocação Inngest (~14min finish timeout). */

export const INNGEST_FINISH_MS = 14 * 60 * 1000;
export const PLATFORM_YIELD_BUFFER_MS = 60_000;

export function platformDeadlineExceeded(
  invocationStartedAt: number,
  nowMs: number = Date.now(),
): boolean {
  return nowMs - invocationStartedAt >= INNGEST_FINISH_MS - PLATFORM_YIELD_BUFFER_MS;
}

export function remainingPlatformMs(
  invocationStartedAt: number,
  nowMs: number = Date.now(),
): number {
  return Math.max(
    0,
    INNGEST_FINISH_MS - PLATFORM_YIELD_BUFFER_MS - (nowMs - invocationStartedAt),
  );
}