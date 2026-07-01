import { describe, expect, it } from "vitest";
import { buildJobStreamTree, deriveCardView } from "@/lib/agent-job-stream";
import { initialAgentProgress } from "@/lib/agent-progress";

describe("buildJobStreamTree validate_fail hygiene", () => {
  it("colapsa validate_fail preflight repetido em um único resultado", () => {
    const nodes = buildJobStreamTree([
      {
        type: "validate_fail",
        data: {
          preflight: true,
          feedback: "Preflight falhou — preparando ambiente",
        },
        timestamp: 1,
      },
      {
        type: "validate_fail",
        data: {
          preflight: true,
          feedback: "Preflight falhou — preparando ambiente",
        },
        timestamp: 2,
      },
    ]);

    const results = nodes.filter((node) => node.kind === "result");
    expect(results).toHaveLength(1);
    if (results[0]?.kind === "result") {
      expect(results[0].status).toBe("failed");
      expect(results[0].summary).toBe("Preflight falhou");
    }
  });
});

describe("buildJobStreamTree terminal close", () => {
  it("fecha a última step ativa quando chega finish", () => {
    const nodes = buildJobStreamTree([
      {
        type: "tool_start",
        timestamp: 1,
        data: {
          name: "fs_read",
          args: { path: "src/App.tsx" },
          step_intent: "Ler App",
        },
      },
      {
        type: "finish",
        timestamp: 2,
        data: { ok: true },
      },
    ]);

    const steps = nodes.filter((node) => node.kind === "step");
    expect(steps).toHaveLength(1);
    if (steps[0]?.kind === "step") {
      expect(steps[0].status).toBe("done");
    }
  });
});

describe("buildJobStreamTree task events", () => {
  it("materializa eventos task como nós de tarefa no inspector", () => {
    const nodes = buildJobStreamTree([
      {
        type: "task",
        timestamp: 1,
        data: { label: "Extrair hero", phase: "build" },
      },
    ]);

    const tasks = nodes.filter((node) => node.kind === "task");
    expect(tasks).toHaveLength(1);
    if (tasks[0]?.kind === "task") {
      expect(tasks[0].title).toBe("Extrair hero");
      expect(tasks[0].phase).toBe("build");
    }
  });
});

describe("deriveCardView terminal state", () => {
  it("não mantém working quando finished=true e não há step ativa", () => {
    const view = deriveCardView([], {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: null,
    });
    expect(view.cardStatus).toBe("done");
  });
});
