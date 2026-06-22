import {
  Circle,
  FileCode,
  FileText,
  Package,
  Play,
  Terminal,
  Eye,
} from "lucide-react";
import type { PlanStep } from "@/lib/agent-progress";
import { planPhasesFromPlan, type PlanPhaseView } from "@/lib/plan-message-meta";

/* ─── Step type → icon mapping ──────────────────────────────────────── */

function stepIcon(type: PlanStep["type"]) {
  switch (type) {
    case "create_file":
      return <FileCode className="size-3.5" />;
    case "edit_file":
      return <FileText className="size-3.5" />;
    case "shell_exec":
      return <Terminal className="size-3.5" />;
    case "install_dep":
      return <Package className="size-3.5" />;
    case "observe":
      return <Eye className="size-3.5" />;
    default:
      return <Circle className="size-3.5" />;
  }
}

type PlanPhaseListProps = {
  phases: PlanPhaseView[];
  /** Renderiza apenas o cabeçalho "Plan" + step count (sem a lista de fases). */
  compact?: boolean;
  /** ClassName extra para o container raiz. */
  className?: string;
};

/**
 * Componente único de renderização de fases/steps do plano.
 * Usado por:
 *  - ChatPlanDock (card de plano aguardando aprovação)
 *  - ChatJobCard (mini card com plano driven)
 *  - InspectorPlan (visualização completa do plano)
 *
 * Esta é a fonte de padronização — todos que mostram o plano passam aqui.
 */
export function PlanPhaseList({ phases, compact = false, className }: PlanPhaseListProps) {
  if (phases.length === 0) return null;

  const stepCount = phases.reduce((acc, p) => acc + p.steps.length, 0);

  return (
    <div className={className ?? "forge-plan-phases"}>
      {!compact && (
        <div className="forge-plan-dock-header">
          <p className="forge-plan-dock-label forge-plan-dock-label--icon">
            <Play className="size-3" aria-hidden />
            Plan
          </p>
          {stepCount > 0 && (
            <span className="forge-plan-dock-step-count">
              {phases.length} {phases.length === 1 ? "fase" : "fases"} · {stepCount}{" "}
              {stepCount === 1 ? "step" : "steps"}
            </span>
          )}
        </div>
      )}

      {phases.map((phase) => (
        <div key={phase.index} className="forge-plan-phase">
          <div className="forge-plan-phase-header">
            <span className="forge-plan-phase-index">{phase.index + 1}</span>
            <span className="forge-plan-phase-title">{phase.title}</span>
          </div>
          <ul className="forge-plan-step-list">
            {phase.steps.map((step, index) => (
              <li
                key={step.id}
                className="forge-plan-step"
                style={{ "--step-index": index } as React.CSSProperties}
              >
                <span className="forge-plan-step-icon" data-type={step.type}>
                  {stepIcon(step.type)}
                </span>
                <span className="forge-plan-step-text">{step.description}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Helper: renderiza fases direto de um PendingPlan. */
export function PlanPhaseListFromPlan({
  plan,
  compact,
  className,
}: {
  plan: { markdown?: string; steps?: PlanStep[]; mission?: string; summary: string; objective?: string } | null;
  compact?: boolean;
  className?: string;
}) {
  if (!plan) return null;
  // Cast seguro —PendingPlan tem exatamente esses campos (e outros opcionais).
  const phases = planPhasesFromPlan(plan as Parameters<typeof planPhasesFromPlan>[0]);
  return <PlanPhaseList phases={phases} compact={compact} className={className} />;
}
