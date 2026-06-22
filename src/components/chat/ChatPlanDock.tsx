import { useCallback, useState } from "react";
import { Check, FileText, Loader2, SkipForward } from "lucide-react";
import type { PendingPlan, PlanStep } from "@/lib/agent-progress";
import { buildForgePlanMarkdown } from "@/lib/plan-document";
import { enabledPlanSteps } from "@/lib/forge-run";
import { planParagraphFromPlan } from "@/lib/plan-message-meta";
import { buildPlanPromptPreview } from "@/lib/plan-prompt";

export type ChatPlanDockProps = {
  pendingPlan: PendingPlan | null;
  creating: boolean;
  onReview?: (runId: string) => void;
  onApprove?: (steps: PlanStep[], markdown?: string) => void | Promise<void>;
  onReject?: (reason?: string) => void | Promise<void>;
  /** When set, renders in read-only mode showing plan status (approved/rejected). */
  status?: "approved" | "rejected";
};

export function ChatPlanDock({
  pendingPlan,
  creating,
  onReview,
  onApprove,
  onReject,
  status,
}: ChatPlanDockProps) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const handleApprove = useCallback(async () => {
    if (!pendingPlan || !onApprove) return;
    setBusy("approve");
    try {
      const markdown =
        pendingPlan.markdown?.trim() ||
        buildForgePlanMarkdown({
          summary: pendingPlan.summary,
          rationale: pendingPlan.rationale,
          mission: pendingPlan.mission,
          objective: pendingPlan.objective,
          steps: pendingPlan.steps,
        }).markdown;
      await onApprove(enabledPlanSteps(pendingPlan.steps), markdown);
    } finally {
      setBusy(null);
    }
  }, [onApprove, pendingPlan]);

  const handleReject = useCallback(async () => {
    if (!onReject) return;
    setBusy("reject");
    try {
      await onReject();
    } finally {
      setBusy(null);
    }
  }, [onReject]);

  if (status && pendingPlan) {
    const body = planParagraphFromPlan(pendingPlan);
    const approved = status === "approved";
    return (
      <div className="forge-plan-dock" data-testid="chat-plan-status-readonly">
        <div className={`forge-plan-status-card forge-plan-status-card--${status}`}>
          <div className="forge-plan-status-header">
            <span className={`forge-plan-status-badge forge-plan-status-badge--${status}`}>
              {approved ? "Approved" : "Rejected"}
            </span>
            <span className="forge-plan-status-label">
              {approved ? "Plano aprovado" : "Plano rejeitado"}
            </span>
          </div>
          <div className="forge-plan-dock-inner">
            <p className="forge-plan-dock-label forge-plan-dock-label--icon">
              <FileText className="size-3" aria-hidden />
              Plan
            </p>
            <p className="forge-plan-dock-body">{body}</p>
          </div>
          {onReview && (
            <div className="forge-composer-row">
              <div className="forge-composer-row-start">
                <button
                  type="button"
                  className="forge-plan-dock-btn"
                  onClick={() => onReview(pendingPlan.runId)}
                >
                  {approved ? "Open approved plan" : "Open rejected plan"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!creating && !pendingPlan) return null;

  if (creating && !pendingPlan) {
    return (
      <div className="forge-plan-dock" data-testid="chat-plan-dock-creating">
        <div className="forge-plan-dock-shell">
          <div className="forge-plan-dock-inner">
            <div className="forge-plan-dock-shimmer" aria-hidden />
          </div>
          <p className="forge-plan-dock-creating-label">Creating plan…</p>
        </div>
      </div>
    );
  }

  if (!pendingPlan) return null;

  const preview = buildPlanPromptPreview(pendingPlan);

  return (
    <div className="forge-plan-dock" data-testid="chat-plan-dock-ready">
      <div className="forge-plan-prompt">
        <div className="forge-plan-prompt-header">
          <FileText className="size-4 shrink-0" aria-hidden />
          <div>
            <p className="forge-plan-prompt-kicker">Plan ready</p>
            <h3 className="forge-plan-prompt-title">{preview.title}</h3>
          </div>
        </div>

        {preview.mission ? (
          <div>
            <span className="forge-plan-prompt-label">Missão</span>
            <p className="forge-plan-prompt-mission">{preview.mission}</p>
          </div>
        ) : null}

        {preview.objective ? (
          <div>
            <span className="forge-plan-prompt-label">Objetivo</span>
            <p className="forge-plan-prompt-objective">{preview.objective}</p>
          </div>
        ) : null}

        {preview.phases.length > 0 ? (
          <div className="forge-plan-prompt-phases">
            {preview.phases.map((phase) => (
              <div key={phase.title}>
                <p className="forge-plan-prompt-phase-title">{phase.title}</p>
                <ul className="forge-plan-prompt-phase-list">
                  {phase.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}

        {preview.hasMoreSteps ? (
          <p className="forge-plan-prompt-more">
            +{preview.stepCount - preview.phases.reduce((n, p) => n + p.items.length, 0)} passos no
            inspector
          </p>
        ) : null}

        <div className="forge-composer-row">
          <div className="forge-composer-row-start">
            <button
              type="button"
              className="forge-plan-dock-btn"
              onClick={() => onReview?.(pendingPlan.runId)}
            >
              Review
            </button>
          </div>
          <div className="forge-composer-spacer" aria-hidden />
          <div className="forge-composer-row-end">
            <button
              type="button"
              className="forge-plan-dock-btn"
              disabled={busy !== null}
              onClick={handleReject}
            >
              {busy === "reject" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <SkipForward className="size-3.5" />
              )}
              Skip
            </button>
            <button
              type="button"
              className="forge-plan-dock-btn forge-plan-dock-btn--approve"
              disabled={busy !== null}
              onClick={handleApprove}
            >
              {busy === "approve" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}