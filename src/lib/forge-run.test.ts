import { describe, expect, it } from "vitest";
import { initialAgentProgress, type PendingPlan } from "@/lib/agent-progress";
import {
  buildAgentRunView,
  buildForgeTimeline,
  deriveTasksFromPlan,
  isRunEffectivelyActive,
} from "@/lib/forge-run";

const samplePlan: PendingPlan = {
  planId: "p1",
  summary: "Landing page",
  mission: "Criar landing",
  steps: [
    { id: "s1", type: "custom", description: "Hero section", enabled: true },
    { id: "s2", type: "custom", description: "Features section", enabled: true },
    { id: "s3", type: "custom", description: "CTA section", enabled: true },
  ],
  ttlMs: 60_000,
  proposedAt: Date.now(),
  runId: "run-1",
  projectId: "proj-1",
};

describe("forge-run job requirements", () => {
  it("lista atômica usa passos do plano, não fases da timeline", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "execute",
      currentStep: 1,
      timeline: [
        { type: "phase", data: { phase: "gather", message: "Coletando contexto" }, timestamp: 1 },
        { type: "memory", data: { message: "Lendo arquivos" }, timestamp: 2 },
      ],
    };

    const view = buildAgentRunView("run-1", progress, {
      running: true,
      jobPlan: samplePlan,
    });

    expect(view.miniCard.tasks.map((t) => t.label)).toEqual([
      "Hero section",
      "Features section",
      "CTA section",
    ]);
    expect(view.miniCard.tasks.some((t) => t.label.includes("Coletando"))).toBe(false);
  });

  it("sem plano não deriva tarefas da timeline SSE", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "execute",
      timeline: [
        { type: "phase", data: { phase: "execute", message: "Gerando código" }, timestamp: 1 },
        { type: "memory", data: { message: "Editando App.tsx" }, timestamp: 2 },
      ],
    };

    const view = buildAgentRunView("run-1", progress, { running: true });
    expect(view.miniCard.tasks).toEqual([]);
  });

  it("marca todos os passos como done quando o job terminou com sucesso", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "done",
      finished: true,
      lastFinishOk: true,
      currentStep: 2,
    };

    const tasks = deriveTasksFromPlan(samplePlan, progress);
    expect(tasks.every((t) => t.status === "done")).toBe(true);
  });
});

describe("forge-run terminal state", () => {
  it("não trata run como ativa quando progress.finished", () => {
    const progress = {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: true,
      timeline: [
        {
          type: "assistant_text",
          data: { delta: true, text: "Pensando…" },
          timestamp: Date.now() - 5000,
        },
      ],
    };

    expect(isRunEffectivelyActive(progress, true)).toBe(false);

    const view = buildAgentRunView("run-1", progress, {
      running: true,
      jobPlan: samplePlan,
    });

    expect(view.miniCard.status).toBe("done");
    expect(view.thinking?.active).toBe(false);
    const thought = buildForgeTimeline(progress.timeline, false).at(-1);
    expect(thought).toMatchObject({ type: "THOUGHT" });
    expect(thought && "active" in thought && thought.active).not.toBe(true);
  });

  it("mini-card done mesmo com slotActive stale após finish", () => {
    const progress = {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: true,
      phase: "execute",
      currentStep: 3,
    };

    const view = buildAgentRunView("run-1", progress, {
      running: true,
      jobPlan: samplePlan,
    });

    expect(view.miniCard.status).toBe("done");
    expect(view.miniCard.tasks.every((t) => t.status === "done")).toBe(true);
  });
});