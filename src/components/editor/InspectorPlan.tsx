import { useCallback, useMemo, useState } from "react";
import { Check, Loader2, Pencil, SkipForward } from "lucide-react";
import type { DesignPlanField, PendingPlan, PlanStep } from "@/lib/agent-progress";
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

/* ─── Design Direction Card (voice, mood, moment, techniques, refs) ── */

function DesignDirectionCard({ design }: { design: DesignPlanField }) {
  return (
    <div className="forge-plan-design" data-testid="inspector-plan-design">
      <span className="forge-plan-design-heading">Direção Visual</span>

      <div className="forge-plan-design-tags">
        {design.voice.map((lang) => (
          <span key={lang} className="forge-plan-design-tag forge-plan-design-tag--brand">
            {lang}
          </span>
        ))}
        {design.mood && (
          <span className="forge-plan-design-tag">{design.mood}</span>
        )}
      </div>

      <p className="forge-plan-design-moment">
        <strong>Momento-memorável:</strong> {design.moment}
      </p>

      {design.synthesis_reasoning && (
        <p className="forge-plan-design-synthesis">{design.synthesis_reasoning}</p>
      )}

      {design.techniques.length > 0 && (
        <div className="forge-plan-design-section">
          <span className="forge-plan-design-section-label">Técnicas:</span>
          <div className="forge-plan-design-chips">
            {design.techniques.map((tech) => (
              <span key={tech} className="forge-plan-design-chip">{tech}</span>
            ))}
          </div>
        </div>
      )}

      {design.references && design.references.length > 0 && (
        <div className="forge-plan-design-section">
          <span className="forge-plan-design-section-label">Referências:</span>
          {design.references.map((ref, i) => (
            <a
              key={i}
              href={ref.url}
              target="_blank"
              rel="noopener noreferrer"
              className="forge-plan-design-ref"
            >
              {ref.title || ref.url}
            </a>
          ))}
        </div>
      )}

      {design.anti_patterns && design.anti_patterns.length > 0 && (
        <details className="forge-plan-design-antipatterns">
          <summary>Anti-padrões evitados ({design.anti_patterns.length})</summary>
          <ul>
            {design.anti_patterns.map((ap, i) => (
              <li key={i}>{ap}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ─── Inspector Plan ──────────────────────────────────────────────── */

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

  return (
    <div className="forge-inspector-plan" data-testid="inspector-plan">
      <div className={`forge-inspector-plan-status forge-inspector-plan-status--${status}`} data-testid="inspector-plan-status">
        <span className="forge-inspector-plan-status-label">{statusCopy}</span>
        <span className="forge-inspector-plan-status-summary">
          {plan.mission?.trim() || plan.summary}
        </span>
      </div>

      {plan.design && <DesignDirectionCard design={plan.design} />}

      <div className="forge-inspector-plan-doc">
        <MarkdownRenderer className="forge-inspector-plan-markdown">{markdown}</MarkdownRenderer>
      </div>

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
