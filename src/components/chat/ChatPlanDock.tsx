import { useCallback, useState } from "react";
import { Check, Loader2, Play, SkipForward } from "lucide-react";
import type { PendingPlan, PlanStep } from "@/lib/agent-progress";
import { buildForgePlanMarkdown } from "@/lib/plan-document";
import { enabledPlanSteps } from "@/lib/forge-run";
import { planParagraphFromPlan, planPhasesFromPlan } from "@/lib/plan-message-meta";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { PlanPhaseList } from "./PlanPhaseList";
import { PlanWaitingBanner } from "@/components/editor/PlanWaitingBanner";

export type ChatPlanDockProps = {
  pendingPlan: PendingPlan | null;
  creating: boolean;
  materializing?: boolean;
  onReview?: (runId: string) => void;
  onApprove?: (steps: PlanStep[], markdown?: string) => void | Promise<void>;
  onReject?: (reason?: string) => void | Promise<void>;
};

export function ChatPlanDock({
  pendingPlan,
  creating,
  materializing = false,
  onReview,
  onApprove,
  onReject,
}: ChatPlanDockProps) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const handleApprove = useCallback(async () => {
    if (!pendingPlan || !onApprove) return;
    setBusy("approve");
    try {
      logEditorTelemetryEvent(
        "chat",
        "plan_approve_click",
        "info",
        `${pendingPlan.runId.slice(0, 8)} ${pendingPlan.planId} steps=${pendingPlan.steps.length}`,
      );
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

  /* ─── Skeleton: show while creating plan ────────────────────────── */
  if (creating && !pendingPlan) {
    return (
      <div className="forge-plan-dock" data-testid="chat-plan-dock-creating">
        <div className="forge-plan-dock-shell">
          <div className="forge-plan-dock-shimmer-lines" aria-hidden>
            <div className="forge-plan-dock-shimmer-line" style={{ width: "45%" }} />
            <div className="forge-plan-dock-shimmer-line" style={{ width: "78%" }} />
            <div className="forge-plan-dock-shimmer-line" style={{ width: "62%" }} />
            <div className="forge-plan-dock-shimmer-line" style={{ width: "38%" }} />
          </div>
          <p className="forge-plan-dock-creating-label">Creating plan…</p>
        </div>
      </div>
    );
  }

  /* ─── Nothing to show ───────────────────────────────────────────── */
  if (!pendingPlan) return null;

  /* ─── Ready plan — structured phases or markdown fallback ──────── */
  const phases = planPhasesFromPlan(pendingPlan);
  const hasPhases = phases.length > 0;
  const awaitingApproval = !materializing;
  const bannerHeadline = materializing ? "Build iniciando agora" : "Plano aguardando aprovação";

  return (
    <div className="forge-plan-dock" data-testid="chat-plan-dock-ready">
      <div className="forge-plan-dock-shell forge-plan-dock-shell--ready">
        <PlanWaitingBanner
          variant={materializing ? "approved" : "waiting"}
          headline={bannerHeadline}
        />

        <div className="forge-plan-dock-scroll">
          <button
            type="button"
            className="forge-plan-dock-title-button"
            onClick={() => onReview?.(pendingPlan.runId)}
          >
            <span className="forge-plan-dock-title-copy">
              {materializing ? "Plano aprovado" : "Ver plano completo"}
            </span>
            <span className="forge-plan-dock-title-headline">{pendingPlan.summary}</span>
          </button>

          {hasPhases ? (
            <PlanPhaseList phases={phases} compact />
          ) : (
            <div className="forge-plan-dock-inner">
              <p className="forge-plan-dock-label forge-plan-dock-label--icon">
                <Play className="size-3" aria-hidden />
                Plan
              </p>
              <p className="forge-plan-dock-body">{planParagraphFromPlan(pendingPlan)}</p>
            </div>
          )}
        </div>

        <div className="forge-composer-row">
          <div className="forge-composer-row-start">
            <button
              type="button"
              className="forge-plan-dock-btn forge-plan-dock-btn--inspect"
              onClick={() => onReview?.(pendingPlan.runId)}
            >
              Inspect
            </button>
          </div>
          <div className="forge-composer-spacer" aria-hidden />
          {awaitingApproval ? (
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
          ) : (
            <div className="forge-composer-row-end">
              <span className="forge-plan-dock-live-state">
                <Loader2 className="size-3.5 animate-spin" />
                Build materializando
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
