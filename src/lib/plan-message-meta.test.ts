import { describe, expect, it } from "vitest";
import {
  needsPlanApprovalNow,
  planParagraphFromPlan,
  resolveInspectorPlanForRun,
  resolvePendingPlan,
  runBelongsToChatMessages,
  storedPlanFromMessage,
} from "@/lib/plan-message-meta";
import type { PendingPlan } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";

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

  it("resolveInspectorPlanForRun usa DB quando live foi limpo", () => {
    const pending: ChatMessage = {
      id: "m-pending",
      role: "assistant",
      content: "## Plano",
      timestamp: 0,
      meta: {
        runId: "run-plan",
        planId: "plan-db",
        planSummary: "Landing café",
        planMission: "Desbloquear exclusão",
        planSteps: [{ id: "s1", type: "custom", description: "Hero", enabled: true }],
        planStatus: "pending",
      },
    };
    const state = resolveInspectorPlanForRun("run-plan", [pending], { livePlan: null });
    expect(state?.plan.summary).toBe("Landing café");
    expect(state?.status).toBe("pending");
    expect(state?.awaitingApproval).toBe(true);
  });

  it("resolveInspectorPlanForRun marca approved após decisão", () => {
    const approved: ChatMessage = {
      id: "m-approved",
      role: "assistant",
      content: "## Plano",
      timestamp: 0,
      meta: {
        runId: "run-plan",
        planId: "plan-db",
        planSummary: "Landing café",
        planSteps: [{ id: "s1", type: "custom", description: "Hero", enabled: true }],
        planStatus: "approved",
      },
    };
    const state = resolveInspectorPlanForRun("run-plan", [approved]);
    expect(state?.status).toBe("approved");
    expect(state?.awaitingApproval).toBe(false);
  });

  it("resolvePendingPlan prioriza live da mesma conversa e cai no histórico", () => {
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
      runId: "run-1",
      projectId: "p1",
    };
    expect(resolvePendingPlan(live, [pending])?.planId).toBe("live");
    expect(resolvePendingPlan(null, [pending])?.planId).toBe("plan-1");
  });

  it("ignora live plan de outra conversa (chat vazio)", () => {
    const staleLive = {
      planId: "stale",
      summary: "Plano antigo",
      steps: [{ id: "s1", type: "custom" as const, description: "x", enabled: true }],
      ttlMs: 60_000,
      proposedAt: Date.now(),
      runId: "old-run",
      projectId: "p1",
    };
    expect(resolvePendingPlan(staleLive, [])).toBeNull();
    expect(needsPlanApprovalNow(staleLive, [])).toBe(false);
    expect(runBelongsToChatMessages("old-run", [])).toBe(false);
  });
});

describe("planParagraphFromPlan", () => {
  it("usa missão como parágrafo único (img 14)", () => {
    const plan: PendingPlan = {
      planId: "p1",
      summary: "Defining cross-view deletion strategy planning",
      mission:
        "Desbloquear exclusão do documento travado (vínculo com proposta no banco) e adicionar botão Excluir para documentos pendentes na aba Documentos",
      steps: [],
      ttlMs: 60_000,
      proposedAt: Date.now(),
      runId: "run-1",
      projectId: "proj",
    };
    expect(planParagraphFromPlan(plan)).toBe(plan.mission);
  });

  it("prefere markdown plano sem headings", () => {
    const plan: PendingPlan = {
      planId: "p2",
      summary: "Resumo",
      markdown: "Texto corrido sem seções markdown.",
      steps: [],
      ttlMs: 60_000,
      proposedAt: Date.now(),
      runId: "run-2",
      projectId: "proj",
    };
    expect(planParagraphFromPlan(plan)).toBe("Texto corrido sem seções markdown.");
  });
});
