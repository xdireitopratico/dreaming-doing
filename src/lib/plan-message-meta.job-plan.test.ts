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

  const approveUser: ChatMessage = {
    id: "u-approve",
    role: "user",
    content: "Plano aprovado",
    timestamp: 1,
    meta: {
      kind: "plan_approved",
      planSourceRunId: "plan-run",
      planId: "p1",
      buildRunId: "build-run",
    },
  };

  it("resolve plano do build run via mensagem de aprovação", () => {
    const plan = resolveJobPlanForRun("build-run", [planMsg, approveUser]);
    expect(plan?.summary).toBe("Landing café");
    expect(plan?.steps).toHaveLength(2);
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
    const plan = resolveJobPlanForRun("build-run", [planMsg, approveUser], { livePlan: live });
    expect(plan?.summary).toBe("Live plan");
  });
});
