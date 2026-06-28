import { describe, expect, it, vi, beforeEach } from "vitest";

const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn(async () => null);

const firstRunDeferred = (() => {
  let resolve!: (value: { data: { status: string; error: string | null; canceled_at: null; meta: null; heartbeat_at: null; started_at: null } | null; error: null }) => void;
  const promise = new Promise<{ data: { status: string; error: string | null; canceled_at: null; meta: null; heartbeat_at: null; started_at: null } | null; error: null }>((res) => {
    resolve = res;
  });
  return { promise, resolve };
})();

let agentRunsCallCount = 0;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: (...args: any[]) => mockChannel(...args),
    removeChannel: (...args: any[]) => mockRemoveChannel(...args),
    from: (table: string) => {
      if (table === "agent_stream_events") {
        return {
          select: () => ({
            eq: () => ({
              gt: () => ({
                order: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "agent_runs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => {
                agentRunsCallCount += 1;
                if (agentRunsCallCount === 1) return firstRunDeferred.promise;
                return Promise.resolve({
                  data: {
                    status: "running",
                    error: null,
                    canceled_at: null,
                    meta: null,
                    heartbeat_at: null,
                    started_at: null,
                  },
                  error: null,
                });
              },
            }),
          }),
        };
      }
      return {};
    },
  },
}));

import { createRunSubscriptionHandlers } from "@/hooks/agent-run/agent-run-subscribe";

function makeChannel() {
  return {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
}

describe("createRunSubscriptionHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentRunsCallCount = 0;
  });

  it("evita criar duas subscriptions concorrentes para o mesmo run", async () => {
    const eventChannel = makeChannel();
    const statusChannel = makeChannel();
    mockChannel.mockImplementation((name: string) => {
      if (String(name).includes("agent-events")) return eventChannel;
      if (String(name).includes("agent-status")) return statusChannel;
      return makeChannel();
    });

    const deps = {
      runIdRef: { current: null },
      closedRunIdRef: { current: null as string | null },
      lastSeqRef: { current: 0 },
      pendingQueueCountRef: { current: 0 },
      activeRunStartedAtMsRef: { current: null },
      streamBufferRef: { current: [] },
      eventChannelRef: { current: null },
      statusChannelRef: { current: null },
      stalePollRef: { current: null },
      reconnectAttemptsRef: { current: 0 },
      reconnectTimerRef: { current: null },
      setProgress: vi.fn(),
      setConnected: vi.fn(),
      setActiveRunId: vi.fn(),
      setActiveRunStartedAtMs: vi.fn(),
      setQueueBlockingReason: vi.fn(),
      enqueueStreamRow: vi.fn(() => false),
      releaseLiveRunSlot: vi.fn(),
    };

    const { subscribeToRun } = createRunSubscriptionHandlers(deps as never);

    const first = subscribeToRun("run-1");
    const second = subscribeToRun("run-1");

    firstRunDeferred.resolve({
      data: null,
      error: null,
    });

    await Promise.all([first, second]);

    expect(mockChannel).toHaveBeenCalledTimes(2);
    expect(eventChannel.on).toHaveBeenCalledTimes(2);
    expect(statusChannel.on).toHaveBeenCalledTimes(1);
  });
});
