import { useCallback, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { PendingPlan, PlanStep } from "@/lib/agent-progress";
import { buildForgePlanMarkdown } from "@/lib/plan-document";
import { enabledPlanSteps } from "@/lib/forge-run";

type InspectorPlanProps = {
  plan: PendingPlan;
  onApprove: (steps: PlanStep[], markdown?: string) => void | Promise<void>;
  onReject: (reason?: string) => void | Promise<void>;
};

export function InspectorPlan({ plan, onApprove, onReject }: InspectorPlanProps) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [editing, setEditing] = useState(false);
  const initialMarkdown =
    plan.markdown?.trim() ||
    buildForgePlanMarkdown({
      summary: plan.summary,
      rationale: plan.rationale,
      mission: plan.mission,
      objective: plan.objective,
      steps: plan.steps,
    }).markdown;

  const [markdown, setMarkdown] = useState(initialMarkdown);

  const handleApprove = useCallback(async () => {
    setBusy("approve");
    try {
      await onApprove(enabledPlanSteps(plan.steps), markdown);
    } finally {
      setBusy(null);
    }
  }, [onApprove, plan.steps, markdown]);

  const handleReject = useCallback(async () => {
    setBusy("reject");
    try {
      await onReject();
    } finally {
      setBusy(null);
    }
  }, [onReject]);

  return (
    <div className="forge-inspector-plan" data-testid="inspector-plan">
      <header className="mb-3">
        <p className="forge-inspector-section-label">Plano FORGE</p>
        <h3 className="forge-inspector-plan-mission">{plan.mission ?? plan.summary}</h3>
      </header>

      <div className="forge-inspector-plan-doc">
        {editing ? (
          <textarea
            className="forge-inspector-plan-textarea w-full min-h-[240px] bg-transparent resize-y outline-none"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
          />
        ) : (
          <div className="forge-chat-markdown text-sm">
            <MarkdownRenderer>{markdown}</MarkdownRenderer>
          </div>
        )}
      </div>

      <footer className="forge-inspector-plan-footer">
        <button
          type="button"
          className="forge-inspector-plan-btn"
          onClick={() => setEditing((v) => !v)}
        >
          <Pencil className="size-3.5" />
          {editing ? "Visualizar" : "Editar"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          className="forge-inspector-plan-btn forge-inspector-plan-btn--danger"
          onClick={handleReject}
        >
          {busy === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          Rejeitar
        </button>
        <button
          type="button"
          disabled={busy !== null}
          className="forge-inspector-plan-approve"
          onClick={handleApprove}
        >
          {busy === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Aprovar e construir
        </button>
      </footer>
    </div>
  );
}