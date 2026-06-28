import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import { resolveJobPlanForRun } from "@/lib/plan-message-meta";

describe("resolveJobPlanForRun", () => {
  const planMsg: ChatMessage = {
    id: "a-plan",
    role: "assistant",
    content: "## Plano",
    timestamp: 0,
    meta: {
      runId: "plan-run",
      planId: "p1",
      planSummary: "Landing café",
      planStatus: "approved",
      planSteps: [
        { id: "s1", type: "custom", description: "Hero", enabled: true },
        { id: "s2", type: "custom", description: "Menu", enabled: true },
      ],
    },
  };

  const approvedPlanMsg: ChatMessage = {
    ...planMsg,
    meta: {
      ...planMsg.meta,
      planStatus: "approved",
      planApprovedAt: "2026-01-01T00:00:00Z",
      buildRunId: "build-run",
    },
  };

  it("resolve plano do build run via meta do plano aprovado", () => {
    const plan = resolveJobPlanForRun("build-run", [approvedPlanMsg]);
    expect(plan?.summary).toBe("Landing café");
    expect(plan?.steps).toHaveLength(2);
    expect(plan?.runId).toBe("build-run");
  });

  it("prioriza livePlan quando runId coincide", () => {
    const live = {
      planId: "live",
      summary: "Live plan",
      steps: [{ id: "x", type: "custom" as const, description: "Live step", enabled: true }],
      ttlMs: 60_000,
      proposedAt: Date.now(),
      runId: "build-run",
      projectId: "p1",
    };
    const plan = resolveJobPlanForRun("build-run", [approvedPlanMsg], { livePlan: live });
    expect(plan?.summary).toBe("Live plan");
  });
});
