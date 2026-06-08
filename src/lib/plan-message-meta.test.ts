import { describe, expect, it } from "vitest";
import { storedPlanFromMessage } from "@/lib/plan-message-meta";
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
});