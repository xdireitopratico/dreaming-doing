import type { PendingPlan } from "@/lib/agent-progress";
import { buildForgePlanMarkdown } from "@/lib/plan-document";

export type PlanPromptPhase = {
  title: string;
  items: string[];
};

export type PlanPromptPreview = {
  title: string;
  mission: string;
  objective?: string;
  phases: PlanPromptPhase[];
  stepCount: number;
  hasMoreSteps: boolean;
};

const MAX_PHASES = 3;
const MAX_ITEMS_PER_PHASE = 4;
const MAX_FLAT_STEPS = 6;

/** Resumo estruturado do plano para o mini-card no chat (estilo Lovable). */
export function buildPlanPromptPreview(plan: PendingPlan): PlanPromptPreview {
  const title = plan.summary?.trim() || "Plano proposto";
  const mission = plan.mission?.trim() || title;
  const objective = plan.objective?.trim() || plan.rationale?.trim() || undefined;

  const enabled = plan.steps.filter((s) => s.enabled);
  const steps = enabled.length > 0 ? enabled : plan.steps;

  const doc = buildForgePlanMarkdown({
    summary: plan.summary,
    rationale: plan.rationale,
    mission: plan.mission,
    objective: plan.objective,
    steps: plan.steps,
  });

  let phases: PlanPromptPhase[] = doc.phases.slice(0, MAX_PHASES).map((p) => ({
    title: p.title,
    items: p.tasks.slice(0, MAX_ITEMS_PER_PHASE),
  }));

  if (phases.length === 0 && steps.length > 0) {
    phases = [
      {
        title: "Passos",
        items: steps.slice(0, MAX_FLAT_STEPS).map((s) => s.description),
      },
    ];
  }

  return {
    title,
    mission,
    objective,
    phases,
    stepCount: steps.length,
    hasMoreSteps: steps.length > MAX_FLAT_STEPS,
  };
}
