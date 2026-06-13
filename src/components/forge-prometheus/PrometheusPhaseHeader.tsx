/**
 * PrometheusPhaseHeader — workflow rail + boardroom narrative header (Opção B)
 */
import { X, ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import type { BoardroomPhase } from "./PrometheusBoardroom";
import { findModel } from "./prometheusCatalog";
import "./prometheus-studio.css";

interface Props {
  currentPhase: string;
  workflowPhase?: BoardroomPhase;
  agentName?: string;
  onGoHome: () => void;
  onPhaseClick?: (phase: string) => void;
  qualityModel?: string;
  convergenceScore?: number;
  currentRound?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const WORKFLOW_STAGES: Array<{ id: BoardroomPhase; label: string }> = [
  { id: "discovery", label: "Descoberta" },
  { id: "clarification", label: "Clarificação" },
  { id: "planning", label: "Planejamento" },
  { id: "approval", label: "Aprovação" },
  { id: "building", label: "Construção" },
  { id: "testing", label: "Testes" },
  { id: "review", label: "Revisão" },
  { id: "deploying", label: "Deploy" },
  { id: "complete", label: "Concluído" },
];

const BOARDROOM_PLANNING: Array<{
  id: BoardroomPhase;
  label: string;
  narrative: string;
}> = [
  {
    id: "discovery",
    label: "Descoberta",
    narrative: "Os agentes estão entendendo o que você precisa",
  },
  {
    id: "clarification",
    label: "Clarificação",
    narrative: "Responda as perguntas para refinar o projeto",
  },
  {
    id: "planning",
    label: "Planejamento",
    narrative: "A equipe está desenhando a arquitetura do seu agente",
  },
];

const DEFAULT_WORKFLOW_BY_SCREEN: Partial<Record<string, BoardroomPhase>> = {
  onboarding: "discovery",
  architecture_brief: "approval",
  review: "review",
  builder: "complete",
  monitoring: "complete",
};

function getModelDisplayName(modelId?: string): string {
  if (!modelId) return "";
  const model = findModel(modelId);
  if (model) return model.label;
  return modelId.charAt(0).toUpperCase() + modelId.slice(1);
}

function resolveBoardroomStep(workflowPhase?: BoardroomPhase) {
  const phase = workflowPhase ?? "discovery";
  let idx = BOARDROOM_PLANNING.findIndex((s) => s.id === phase);
  if (idx < 0) idx = 0;
  return { idx, step: BOARDROOM_PLANNING[idx] };
}

function BoardroomNarrativeHeader({
  agentName,
  workflowPhase,
  onGoHome,
}: {
  agentName?: string;
  workflowPhase?: BoardroomPhase;
  onGoHome: () => void;
}) {
  const { idx, step } = resolveBoardroomStep(workflowPhase);

  return (
    <div
      className="prometheus-studio flex-shrink-0 border-b px-4 py-4 sm:px-6"
      style={{ borderColor: "var(--ps-border)", background: "var(--ps-bg-deep)" }}
    >
      <button
        type="button"
        onClick={onGoHome}
        className="mb-3 inline-flex items-center gap-1.5 text-xs transition-colors"
        style={{ color: "var(--ps-cream-40)" }}
      >
        <X className="h-3.5 w-3.5" />
        Voltar
      </button>

      <h1
        className="truncate text-base font-semibold sm:text-lg"
        style={{ color: "var(--ps-cream)" }}
      >
        {agentName?.trim() || "Novo agente"}
      </h1>

      <p
        className="mt-2 text-sm leading-relaxed"
        style={{ color: "var(--ps-cream-80)" }}
      >
        {step.narrative}
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="ps-boardroom-stepper" aria-hidden>
          {BOARDROOM_PLANNING.map((planStep, planIdx) => {
            const isDone = planIdx < idx;
            const isActive = planIdx === idx;
            return (
              <span key={planStep.id} className="ps-boardroom-stepper__segment">
                <span
                  className="ps-boardroom-stepper__node"
                  data-active={isActive ? "true" : undefined}
                  data-done={isDone ? "true" : undefined}
                />
                {planIdx < BOARDROOM_PLANNING.length - 1 && (
                  <span
                    className="ps-boardroom-stepper__line"
                    data-done={isDone ? "true" : undefined}
                  />
                )}
              </span>
            );
          })}
        </div>

        <p
          className="text-xs font-medium whitespace-nowrap sm:text-sm"
          style={{ color: "var(--ps-cream-60)" }}
        >
          Passo {idx + 1} de {BOARDROOM_PLANNING.length} · {step.label}
        </p>
      </div>

      <div className="mt-2 hidden justify-between gap-2 text-[10px] sm:flex" style={{ color: "var(--ps-cream-25)" }}>
        {BOARDROOM_PLANNING.map((planStep) => (
          <span key={planStep.id} className="flex-1 text-center truncate">
            {planStep.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PrometheusPhaseHeader({
  currentPhase,
  workflowPhase,
  agentName,
  onGoHome,
  onPhaseClick,
  qualityModel,
  convergenceScore,
  currentRound,
  isCollapsed = false,
  onToggleCollapse,
}: Props) {
  if (currentPhase === "boardroom") {
    return (
      <BoardroomNarrativeHeader
        agentName={agentName}
        workflowPhase={workflowPhase}
        onGoHome={onGoHome}
      />
    );
  }

  const activeWorkflow = workflowPhase ?? DEFAULT_WORKFLOW_BY_SCREEN[currentPhase] ?? "discovery";
  const currentWorkflowIdx = Math.max(
    0,
    WORKFLOW_STAGES.findIndex((stage) => stage.id === activeWorkflow),
  );
  const currentScreenLabel = WORKFLOW_STAGES[currentWorkflowIdx]?.label ?? currentPhase;
  const modelDisplayName = getModelDisplayName(qualityModel);

  return (
    <div
      className="prometheus-studio flex-shrink-0 border-b"
      style={{ borderColor: "var(--ps-border)", background: "var(--ps-bg-deep)" }}
    >
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <button
          onClick={onGoHome}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors"
          style={{
            borderColor: "var(--ps-border)",
            background: "var(--ps-bg-surface)",
            color: "var(--ps-cream-80)",
          }}
          title="Voltar ao início"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
          <button
            type="button"
            onClick={onGoHome}
            className="transition-colors whitespace-nowrap"
            style={{ color: "var(--ps-cream-40)" }}
          >
            Prometheus
          </button>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--ps-cream-25)" }} />
          <span className="truncate font-semibold" style={{ color: "var(--ps-cream)" }}>
            {currentScreenLabel}
          </span>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
            style={{
              background: "var(--ps-accent-subtle)",
              border: "1px solid var(--ps-border-accent-dim)",
              color: "var(--ps-accent)",
            }}
          >
            Etapa {currentWorkflowIdx + 1} de {WORKFLOW_STAGES.length}
          </span>
        </div>

        <div className="ml-auto" />

        <div className="hidden sm:flex items-center gap-2">
          {modelDisplayName && (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium whitespace-nowrap"
              style={{
                background: "var(--ps-bg-surface)",
                border: "1px solid var(--ps-border)",
                color: "var(--ps-cream-60)",
              }}
            >
              {modelDisplayName}
            </span>
          )}
          {convergenceScore != null && (
            <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: "var(--ps-accent)" }}>
              Convergência {convergenceScore}%
            </span>
          )}
          {currentRound != null && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] whitespace-nowrap"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "var(--ps-cream-60)",
                border: "1px solid var(--ps-border)",
              }}
            >
              Rodada {currentRound}
            </span>
          )}
        </div>

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors"
            style={{
              borderColor: "var(--ps-border)",
              background: "var(--ps-bg-surface)",
              color: "var(--ps-cream-80)",
            }}
            title={isCollapsed ? "Expandir header" : "Colapsar header"}
            aria-label={isCollapsed ? "Expandir header" : "Colapsar header"}
          >
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div className="px-4 pb-3 sm:px-6">
          <div className="grid w-full grid-cols-9 gap-2">
            {WORKFLOW_STAGES.map((stage, idx) => {
              const isCompleted = idx < currentWorkflowIdx;
              const isActive = idx === currentWorkflowIdx;

              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => onPhaseClick?.(stage.id)}
                  aria-current={isActive ? "step" : undefined}
                  className="flex min-w-0 items-center justify-center gap-2 rounded-full px-2 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: isActive
                      ? "var(--ps-accent-subtle)"
                      : isCompleted
                        ? "var(--ps-bg-surface-hover)"
                        : "transparent",
                    border: `1px solid ${isActive ? "var(--ps-border-accent)" : "var(--ps-border)"}`,
                    color: isActive
                      ? "var(--ps-accent)"
                      : isCompleted
                        ? "var(--ps-cream)"
                        : "var(--ps-cream-40)",
                    cursor: onPhaseClick ? "pointer" : "default",
                  }}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{
                      background: isActive
                        ? "var(--ps-accent)"
                        : isCompleted
                          ? "var(--ps-bg-surface-hover)"
                          : "var(--ps-bg-surface)",
                      color: isActive ? "var(--ps-bg-deep)" : isCompleted ? "var(--ps-cream)" : "var(--ps-cream-40)",
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span className="truncate">{stage.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}