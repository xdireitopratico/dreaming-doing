import { useCallback, useState } from "react";
import {
  Check,
  Circle,
  FileCode,
  FileText,
  Loader2,
  Package,
  Play,
  SkipForward,
  Terminal,
  Eye,
} from "lucide-react";
import type { PendingPlan, PlanStep } from "@/lib/agent-progress";
import { buildForgePlanMarkdown } from "@/lib/plan-document";
import { enabledPlanSteps } from "@/lib/forge-run";
import { planParagraphFromPlan, planPhasesFromPlan } from "@/lib/plan-message-meta";

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

  /* ─── Read-only approved/rejected ────────────────────────────────── */
  if (status && pendingPlan) {
    const phases = planPhasesFromPlan(pendingPlan);
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
            {phases.length > 0 ? (
              <PlanPhaseList phases={phases} />
            ) : (
              <p className="forge-plan-dock-body">{planParagraphFromPlan(pendingPlan)}</p>
            )}
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

  /* ─── Creating shimmer ───────────────────────────────────────────── */
  if (creating && !pendingPlan) {
    return (
      <div className="forge-plan-dock" data-testid="chat-plan-dock-creating">
        <div className="forge-plan-dock-shell">
          <div className="forge-plan-dock-inner">
            <div className="forge-plan-dock-shimmer-lines" aria-hidden>
              <div className="forge-plan-dock-shimmer-line" style={{ width: "40%" }} />
              <div className="forge-plan-dock-shimmer-line" style={{ width: "75%" }} />
              <div className="forge-plan-dock-shimmer-line" style={{ width: "60%" }} />
              <div className="forge-plan-dock-shimmer-line" style={{ width: "50%" }} />
            </div>
          </div>
          <p className="forge-plan-dock-creating-label">Creating plan…</p>
        </div>
      </div>
    );
  }

  if (!creating && !pendingPlan) return null;
  if (!pendingPlan) return null;

  /* ─── Ready — structured plan ────────────────────────────────────── */
  const phases = planPhasesFromPlan(pendingPlan);
  const stepCount = phases.reduce((acc, p) => acc + p.steps.length, 0);

  return (
    <div className="forge-plan-dock">
      <div className="forge-plan-dock-shell" data-testid="chat-plan-dock-ready">
        <div className="forge-plan-dock-inner">
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

          {phases.length > 0 ? (
            <PlanPhaseList phases={phases} />
          ) : (
            <p className="forge-plan-dock-body">{planParagraphFromPlan(pendingPlan)}</p>
          )}
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

/* ─── PlanPhaseList — renders structured phases + steps ───────────── */

function PlanPhaseList({ phases }: { phases: ReturnType<typeof planPhasesFromPlan> }) {
  if (phases.length === 0) return null;

  return (
    <div className="forge-plan-phases">
      {phases.map((phase) => (
        <div key={phase.index} className="forge-plan-phase">
          <div className="forge-plan-phase-header">
            <span className="forge-plan-phase-index">{phase.index + 1}</span>
            <span className="forge-plan-phase-title">{phase.title}</span>
          </div>
          <ul className="forge-plan-step-list">
            {phase.steps.map((step) => (
              <li key={step.id} className="forge-plan-step">
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
