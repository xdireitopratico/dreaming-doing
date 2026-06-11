import { describe, expect, it } from "vitest";
import { buildPlanPromptPreview } from "@/lib/plan-prompt";
import type { PendingPlan } from "@/lib/agent-progress";

const basePlan: PendingPlan = {
  planId: "p-1",
  summary: "Landing page para produto SaaS",
  mission: "Criar landing de conversão",
  objective: "Primeira versão publicável em 1 sessão",
  steps: [
    { id: "s1", type: "observe", description: "Ler estrutura do projeto", enabled: true },
    { id: "s2", type: "create_file", description: "Criar Hero com CTA", enabled: true },
    { id: "s3", type: "create_file", description: "Criar seção de features", enabled: true },
    { id: "s4", type: "shell_exec", description: "Validar build", enabled: true },
  ],
  ttlMs: Number.MAX_SAFE_INTEGER,
  proposedAt: Date.now(),
  runId: "run-1",
  projectId: "proj-1",
};

describe("buildPlanPromptPreview", () => {
  it("monta resumo estruturado com missão e fases", () => {
    const preview = buildPlanPromptPreview(basePlan);
    expect(preview.title).toBe("Landing page para produto SaaS");
    expect(preview.mission).toBe("Criar landing de conversão");
    expect(preview.objective).toBe("Primeira versão publicável em 1 sessão");
    expect(preview.phases.length).toBeGreaterThan(0);
    expect(preview.stepCount).toBe(4);
    expect(preview.hasMoreSteps).toBe(false);
  });

  it("indica passos extras quando há mais de 6", () => {
    const manySteps = {
      ...basePlan,
      steps: Array.from({ length: 8 }, (_, i) => ({
        id: `s${i}`,
        type: "custom" as const,
        description: `Passo ${i + 1}`,
        enabled: true,
      })),
    };
    const preview = buildPlanPromptPreview(manySteps);
    expect(preview.hasMoreSteps).toBe(true);
    expect(preview.stepCount).toBe(8);
  });
});
