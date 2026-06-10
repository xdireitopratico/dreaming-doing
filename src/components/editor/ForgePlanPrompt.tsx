import { ArrowUpRight, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PendingPlan } from "@/lib/agent-progress";
import { buildPlanPromptPreview } from "@/lib/plan-prompt";

type ForgePlanPromptProps = {
  plan: PendingPlan;
  runId: string;
  onOpenPreview: (runId: string) => void;
  disabled?: boolean;
};

export function ForgePlanPrompt({
  plan,
  runId,
  onOpenPreview,
  disabled = false,
}: ForgePlanPromptProps) {
  const preview = buildPlanPromptPreview(plan);

  return (
    <section className="forge-plan-prompt" data-testid="forge-plan-prompt">
      <header className="forge-plan-prompt-header">
        <ClipboardList className="size-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="forge-plan-prompt-kicker">Plano pronto para revisão</p>
          <h3 className="forge-plan-prompt-title">{preview.title}</h3>
        </div>
      </header>

      {preview.mission && preview.mission !== preview.title && (
        <p className="forge-plan-prompt-mission">
          <span className="forge-plan-prompt-label">Missão</span>
          {preview.mission}
        </p>
      )}

      {preview.objective && (
        <p className="forge-plan-prompt-objective">
          <span className="forge-plan-prompt-label">Objetivo</span>
          {preview.objective}
        </p>
      )}

      {preview.phases.length > 0 && (
        <div className="forge-plan-prompt-phases">
          {preview.phases.map((phase) => (
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

      {preview.hasMoreSteps && (
        <p className="forge-plan-prompt-more">
          +{preview.stepCount - 6} passos no preview completo
        </p>
      )}

      <button
        type="button"
        className={cn("forge-plan-prompt-cta", disabled && "forge-plan-prompt-cta--disabled")}
        disabled={disabled}
        onClick={() => onOpenPreview(runId)}
      >
        Ver plano no preview
        <ArrowUpRight className="size-4 shrink-0" aria-hidden />
      </button>
    </section>
  );
}