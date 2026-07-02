import { describe, expect, it } from "vitest";
import {
  shouldRestoreLiveRun,
  SNAPSHOT_HEARTBEAT_FRESH_MS,
  SNAPSHOT_STREAM_FRESH_MS,
} from "@/lib/agent-snapshot-restore";

describe("shouldRestoreLiveRun", () => {
  const now = Date.now();

  it("restaura com heartbeat fresco", () => {
    expect(
      shouldRestoreLiveRun({
        status: "running",
        canceledAt: null,
        heartbeatAt: new Date(now - 30_000).toISOString(),
        startedAt: new Date(now - 120_000).toISOString(),
        lastStreamAt: null,
      }),
    ).toBe(true);
  });

  it("restaura com stream recente mesmo heartbeat velho", () => {
    expect(
      shouldRestoreLiveRun({
        status: "running",
        canceledAt: null,
        heartbeatAt: new Date(now - SNAPSHOT_HEARTBEAT_FRESH_MS - 60_000).toISOString(),
        startedAt: new Date(now - 600_000).toISOString(),
        lastStreamAt: new Date(now - 60_000).toISOString(),
      }),
    ).toBe(true);
  });

  it("não restaura run pendente só porque o started_at é recente", () => {
    expect(
      shouldRestoreLiveRun({
        status: "pending",
        canceledAt: null,
        heartbeatAt: null,
        startedAt: new Date(now - 5_000).toISOString(),
        lastStreamAt: null,
      }),
    ).toBe(false);
  });

  it("não restaura run terminal", () => {
    expect(
      shouldRestoreLiveRun({
        status: "completed",
        canceledAt: null,
        heartbeatAt: new Date(now - 30_000).toISOString(),
        startedAt: null,
        lastStreamAt: null,
      }),
    ).toBe(false);
  });

  it("não restaura zumbi sem stream recente", () => {
    expect(
      shouldRestoreLiveRun({
        status: "running",
        canceledAt: null,
        heartbeatAt: new Date(now - SNAPSHOT_STREAM_FRESH_MS - 60_000).toISOString(),
        startedAt: new Date(now - 3_600_000).toISOString(),
        lastStreamAt: new Date(now - SNAPSHOT_STREAM_FRESH_MS - 60_000).toISOString(),
      }),
    ).toBe(false);
  });
});
