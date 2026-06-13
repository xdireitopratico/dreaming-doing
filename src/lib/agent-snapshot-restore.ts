/** Heartbeat recente no DB — re-subscribe imediato no F5. */
export const SNAPSHOT_HEARTBEAT_FRESH_MS = 2 * 60 * 1000;

/** Evento de stream recente — estende janela quando heartbeat atrasa. */
export const SNAPSHOT_STREAM_FRESH_MS = 5 * 60 * 1000;

export function activityAgeMs(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return Date.now() - new Date(iso).getTime();
}

export function isActivityFresh(
  iso: string | null | undefined,
  maxAgeMs: number,
): boolean {
  return activityAgeMs(iso) < maxAgeMs;
}

/** Decide se F5 deve re-subscribe a um run live no DB. */
export function shouldRestoreLiveRun(input: {
  status: string | null | undefined;
  canceledAt: string | null | undefined;
  heartbeatAt: string | null | undefined;
  startedAt: string | null | undefined;
  lastStreamAt: string | null | undefined;
}): boolean {
  const isLive = input.status === "running" || input.status === "pending";
  if (!isLive || input.canceledAt) return false;

  const heartbeat = input.heartbeatAt ?? input.startedAt ?? null;
  if (isActivityFresh(heartbeat, SNAPSHOT_HEARTBEAT_FRESH_MS)) return true;

  const lastActivity = input.lastStreamAt ?? heartbeat;
  return isActivityFresh(lastActivity, SNAPSHOT_STREAM_FRESH_MS);
}