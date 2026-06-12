import { describe, expect, it } from "vitest";
import { initialAgentProgress } from "@/lib/agent-progress";
import { shouldRetainLiveRunSlot } from "@/lib/live-run-overlay";

describe("shouldRetainLiveRunSlot", () => {
  it("mantém slot com texto até materializar no DB", () => {
    expect(
      shouldRetainLiveRunSlot({
        ...initialAgentProgress,
        finished: true,
        lastFinishOk: true,
        streamText: "Pronto!",
      }),
    ).toBe(true);
  });

  it("libera após cancelamento", () => {
    expect(
      shouldRetainLiveRunSlot({
        ...initialAgentProgress,
        finished: true,
        canceled: true,
      }),
    ).toBe(false);
  });

  it("libera clarify para ancorar no DB", () => {
    expect(
      shouldRetainLiveRunSlot({
        ...initialAgentProgress,
        finished: true,
        awaiting: true,
        awaitingKind: "clarify",
        streamText: "Qual estilo?",
      }),
    ).toBe(false);
  });

  it("mantém plano pendente", () => {
    expect(
      shouldRetainLiveRunSlot({
        ...initialAgentProgress,
        finished: true,
        awaiting: true,
        awaitingKind: "plan_approval",
        pendingPlan: {
          planId: "p1",
          summary: "Plano",
          steps: [{ id: "s1", type: "custom", description: "x", enabled: true }],
          ttlMs: 60_000,
          proposedAt: Date.now(),
          runId: "r1",
          projectId: "proj",
        },
      }),
    ).toBe(true);
  });
});