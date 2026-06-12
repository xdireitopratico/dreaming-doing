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
};

export function ChatPlanDock({
  pendingPlan,
  creating,
  onReview,
  onApprove,
  onReject,
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

  if (!creating && !pendingPlan) return null;

  if (creating && !pendingPlan) {
    return (
      <div className="forge-plan-dock" data-testid="chat-plan-dock-creating">
        <div className="forge-plan-dock-shimmer" aria-hidden />
        <p className="forge-plan-dock-creating-label">Creating plan…</p>
      </div>
    );
  }

  if (!pendingPlan) return null;

  const kickerSummary = pendingPlan.summary?.trim() || "Plano proposto";
  const planBody = planParagraphFromPlan(pendingPlan);

  return (
    <div className="forge-plan-dock" data-testid="chat-plan-dock-ready">
      <div className="forge-plan-approval">
        <div className="forge-plan-waiting-kicker">
          <p className="forge-plan-waiting-kicker-title">Waiting for user to approve plan</p>
          <p className="forge-plan-waiting-kicker-sub">{kickerSummary}</p>
        </div>

        <div className="forge-plan-approval-card">
          <p className="forge-plan-approval-label">Plan</p>
          <p className="forge-plan-approval-body">{planBody}</p>

          <div className="forge-plan-approval-actions">
            <button
              type="button"
              className="forge-plan-approval-btn"
              onClick={() => onReview?.(pendingPlan.runId)}
            >
              Review
            </button>
            <button
              type="button"
              className="forge-plan-approval-btn"
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
              className="forge-plan-approval-btn forge-plan-approval-btn--primary"
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