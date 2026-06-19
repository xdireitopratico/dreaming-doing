import { useCallback, useState } from "react";
import { Check, Loader2, SkipForward } from "lucide-react";
import type { PendingPlan, PlanStep } from "@/lib/agent-progress";
import { buildForgePlanMarkdown } from "@/lib/plan-document";
import { enabledPlanSteps } from "@/lib/forge-run";
import { planParagraphFromPlan } from "@/lib/plan-message-meta";

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
    return (
      <div className="forge-plan-dock" data-testid="chat-plan-status-readonly">
        <div className="forge-plan-status-card">
          <div className="forge-plan-status-header">
            <span className={`forge-plan-status-badge forge-plan-status-badge--${status}`}>
              {status === "approved" ? "Aprovado" : "Rejeitado"}
            </span>
            <span className="forge-plan-status-label">Plano</span>
          </div>
          <div className="forge-plan-dock-inner">
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
                  Review
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

  const planBody = planParagraphFromPlan(pendingPlan);

  return (
    <div className="forge-plan-dock">
      <div className="forge-plan-dock-shell" data-testid="chat-plan-dock-ready">
        <div className="forge-plan-dock-inner">
          <p className="forge-plan-dock-label">Plan</p>
          <p className="forge-plan-dock-body">{planBody}</p>
        </div>

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
