import { afterEach, describe, expect, it, vi } from "vitest";
import { drainPendingQueue, partitionAgentRunExtras, type AgentRunRequest } from "./_shared";

const drainPayload: AgentRunRequest = {
  runId: "1dd5bff2-6722-42a0-8a36-098813d144ab",
  projectId: "a9fa765f-81d4-4552-9532-366f3eb1e6e8",
  conversationId: "e0b8da4f-32fa-47d1-893b-8bcd7142836c",
  userId: "user-1",
  sessionKind: "byok",
  preferences: {},
  planMode: true,
};

describe("partitionAgentRunExtras", () => {
  it("routes plan into metaDelta, not columns", () => {
    const { columns, metaDelta } = partitionAgentRunExtras({ plan: "# My plan" });
    expect(columns).toEqual({});
    expect(metaDelta).toEqual({ plan: "# My plan" });
  });

  it("keeps error on columns and merges nested meta", () => {
    const { columns, metaDelta } = partitionAgentRunExtras({
      error: "agent failed",
      meta: { resumableExhausted: true, resumeAttempts: 3 },
    });
    expect(columns).toEqual({ error: "agent failed" });
    expect(metaDelta).toEqual({ resumableExhausted: true, resumeAttempts: 3 });
  });

  it("ignores status and finished_at from extras", () => {
    const { columns, metaDelta } = partitionAgentRunExtras({
      status: "completed",
      finished_at: "2026-01-01T00:00:00Z",
      plan: null,
    });
    expect(columns).toEqual({});
    expect(metaDelta).toEqual({ plan: null });
  });

  it("merges explicit meta.plan on completed (S1 contract)", () => {
    const { columns, metaDelta } = partitionAgentRunExtras({
      meta: { plan: "doc", planMode: true },
    });
    expect(columns).toEqual({});
    expect(metaDelta).toEqual({ plan: "doc", planMode: true });
  });
});

describe("drainPendingQueue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("omits planMode:false so edge uses pendingBody.mode (S7)", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ continued: false })));
    vi.stubGlobal("fetch", fetchMock);

    await drainPendingQueue(drainPayload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.action).toBe("continue_queue");
    expect(body.planMode).toBeUndefined();
  });
});