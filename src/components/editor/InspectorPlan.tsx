import { useCallback, useMemo, useState } from "react";
import { Check, Loader2, Pencil, SkipForward } from "lucide-react";
import type { PendingPlan, PlanStep } from "@/lib/agent-progress";
import { buildForgePlanMarkdown } from "@/lib/plan-document";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { enabledPlanSteps } from "@/lib/forge-run";
import type { InspectorPlanState } from "@/lib/plan-message-meta";

type InspectorPlanProps = {
  state: InspectorPlanState;
  onApprove?: (steps: PlanStep[], markdown?: string) => void | Promise<void>;
  onReject?: (reason?: string) => void | Promise<void>;
  onEditRequest?: (plan: PendingPlan) => void;
};

/* Sinais meta derivados do plano — escaneáveis em 1 segundo. */
function planMetaSignals(plan: PendingPlan): { size: string; reversible: string } {
  const stepCount = enabledPlanSteps(plan.steps).length;
  const size = stepCount <= 3 ? "S" : stepCount <= 8 ? "M" : "L";
  const reversible = "git revert";
  return { size, reversible };
}

export function InspectorPlan({ state, onApprove, onReject, onEditRequest }: InspectorPlanProps) {
  const { plan, status, awaitingApproval } = state;
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const markdown = useMemo(() => {
    if (plan.markdown?.trim()) return plan.markdown.trim();
    return buildForgePlanMarkdown({
      summary: plan.summary,
      rationale: plan.rationale,
      mission: plan.mission,
      objective: plan.objective,
      steps: plan.steps,
    }).markdown;
  }, [plan]);

  const handleApprove = useCallback(async () => {
    if (!onApprove) return;
    setBusy("approve");
    try {
      await onApprove(enabledPlanSteps(plan.steps), markdown);
    } finally {
      setBusy(null);
    }
  }, [markdown, onApprove, plan.steps]);

  const handleReject = useCallback(async () => {
    if (!onReject) return;
    setBusy("reject");
    try {
      await onReject();
    } finally {
      setBusy(null);
    }
  }, [onReject]);

  const statusCopy =
    status === "approved"
      ? "Aprovado"
      : status === "rejected"
        ? "Rejeitado"
        : "Plano";

  const { size, reversible } = planMetaSignals(plan);

  return (
    <div className="forge-inspector-plan" data-testid="inspector-plan">
      {/* Header fino: status pill + sinais meta + título */}
      <div className="forge-inspector-plan-header" data-testid="inspector-plan-status">
        <div className="forge-inspector-plan-header-row">
          <span className={`forge-inspector-plan-pill forge-inspector-plan-pill--${status}`}>
            {statusCopy}
          </span>
          <span className="forge-inspector-plan-meta">
            {size} · {reversible}
          </span>
        </div>
        <h2 className="forge-inspector-plan-title">
          {plan.mission?.trim() || plan.summary}
        </h2>
      </div>

      {/* Documento markdown — o herói */}
      <div className="forge-inspector-plan-doc">
        <MarkdownRenderer className="forge-inspector-plan-markdown">{markdown}</MarkdownRenderer>
      </div>

      {/* Footer — alavancas de ação */}
      <div className="forge-inspector-plan-footer">
        {awaitingApproval ? (
          <>
            <button
              type="button"
              className="forge-inspector-plan-btn"
              onClick={() => onEditRequest?.(plan)}
              disabled={busy !== null}
            >
              <Pencil className="size-3.5" />
              Editar
            </button>
            <button
              type="button"
              className="forge-inspector-plan-btn forge-inspector-plan-btn--danger"
              onClick={handleReject}
              disabled={busy !== null || !onReject}
            >
              {busy === "reject" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <SkipForward className="size-3.5" />
              )}
              Rejeitar
            </button>
            <button
              type="button"
              className="forge-inspector-plan-approve"
              onClick={handleApprove}
              disabled={busy !== null || !onApprove}
            >
              {busy === "approve" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Aprovar e construir
            </button>
          </>
        ) : (
          <button
            type="button"
            className="forge-inspector-plan-btn"
            onClick={() => onEditRequest?.(plan)}
          >
            <Pencil className="size-3.5" />
            Usar como edição
          </button>
        )}
      </div>
    </div>
  );
}
