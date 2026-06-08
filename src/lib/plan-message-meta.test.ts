import { describe, expect, it } from "vitest";
import { resolvePendingPlan, storedPlanFromMessage } from "@/lib/plan-message-meta";
import type { ChatMessage } from "@/components/editor/ChatInput";

describe("storedPlanFromMessage", () => {
  const base: ChatMessage = {
    id: "m1",
    role: "assistant",
    content: "## Plano",
    timestamp: Date.now(),
    meta: {
      runId: "run-1",
      planId: "plan-1",
      planSummary: "Criar landing",
      planSteps: [{ id: "s1", type: "custom", description: "Passo 1", enabled: true }],
      planStatus: "rejected",
    },
  };

  it("extrai plano rejeitado do meta", () => {
    const stored = storedPlanFromMessage(base);
    expect(stored?.status).toBe("rejected");
    expect(stored?.plan.summary).toBe("Criar landing");
  });

  it("retorna null sem steps", () => {
    expect(storedPlanFromMessage({ ...base, meta: { runId: "r", planId: "p" } })).toBeNull();
  });

  it("plano pending persiste no meta (simula F5)", () => {
    const pending: ChatMessage = {
      ...base,
      meta: {
        runId: "run-f5",
        planId: "plan-f5",
        planSummary: "Landing café",
        planSteps: [{ id: "s1", type: "custom", description: "Hero", enabled: true }],
        planStatus: "pending",
      },
    };
    const stored = storedPlanFromMessage(pending);
    expect(stored?.status).toBe("pending");
    expect(stored?.plan.steps).toHaveLength(1);
    expect(resolvePendingPlan(null, [pending])?.summary).toBe("Landing café");
  });

  it("resolvePendingPlan prioriza live e cai no histórico", () => {
    const pending: ChatMessage = {
      ...base,
      meta: {
        ...base.meta,
        planStatus: "pending",
      },
    };
    const live = {
      planId: "live",
      summary: "Live",
      steps: [{ id: "s1", type: "custom" as const, description: "x", enabled: true }],
      ttlMs: 60_000,
      proposedAt: Date.now(),
      runId: "r-live",
      projectId: "p1",
    };
    expect(resolvePendingPlan(live, [pending])?.planId).toBe("live");
    expect(resolvePendingPlan(null, [pending])?.planId).toBe("plan-1");
  });
});