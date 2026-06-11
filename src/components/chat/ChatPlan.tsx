import { ClipboardList, ArrowUpRight } from "lucide-react";
import type { PlanPrompt } from "@/lib-v2/chat-types";

type ChatPlanProps = {
  plan: PlanPrompt;
  disabled?: boolean;
  onOpenPreview?: (runId: string) => void;
};

export function ChatPlan({ plan, disabled, onOpenPreview }: ChatPlanProps) {
  const phases = groupStepsIntoPhases(plan.steps);

  return (
    <section className="forge-plan-prompt">
      <header className="forge-plan-prompt-header">
        <ClipboardList className="size-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="forge-plan-prompt-kicker">Plano pronto para revisão</p>
          <h3 className="forge-plan-prompt-title">{plan.summary}</h3>
        </div>
      </header>

      {plan.mission && plan.mission !== plan.summary && (
        <p className="forge-plan-prompt-mission">
          <span className="forge-plan-prompt-label">Missão</span>
          {plan.mission}
        </p>
      )}

      {plan.objective && (
        <p className="forge-plan-prompt-objective">
          <span className="forge-plan-prompt-label">Objetivo</span>
          {plan.objective}
        </p>
      )}

      {phases.length > 0 && (
        <div className="forge-plan-prompt-phases">
          {phases.map((phase) => (
            <div key={phase.title} className="forge-plan-prompt-phase">
              <p className="forge-plan-prompt-phase-title">{phase.title}</p>
              <ol className="forge-plan-prompt-phase-list">
                {phase.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {plan.steps.length > 6 && (
        <p className="forge-plan-prompt-more">
          +{plan.steps.length - 6} passos no preview completo
        </p>
      )}

      {onOpenPreview && (
        <button
          type="button"
          className="forge-plan-prompt-cta"
          disabled={disabled}
          onClick={() => onOpenPreview(plan.runId)}
        >
          Ver plano no preview
          <ArrowUpRight className="size-4 shrink-0" aria-hidden />
        </button>
      )}
    </section>
  );
}

function groupStepsIntoPhases(steps: PlanPrompt["steps"]): { title: string; items: string[] }[] {
  const phases: { title: string; items: string[] }[] = [];
  const current = { title: "Passos", items: [] as string[] };

  for (const step of steps.slice(0, 6)) {
    current.items.push(step.description);
  }

  if (current.items.length > 0) phases.push(current);
  return phases;
}
