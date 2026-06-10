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
    <div className="forge-inspector-plan flex flex-col min-h-0" data-testid="inspector-plan">
      <header className="mb-3">
        <p className="text-[length:var(--font-task-label)] uppercase tracking-wider text-[var(--text-muted)] font-mono">
          Plano FORGE
        </p>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mt-1">
          {plan.mission ?? plan.summary}
        </h3>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-[var(--border-forge)] bg-[var(--bg-card)] p-4">
        {editing ? (
          <textarea
            className="w-full min-h-[240px] bg-transparent text-sm text-[var(--text-primary)] font-mono resize-y outline-none"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
          />
        ) : (
          <div className="text-sm text-[var(--text-secondary)]">
            <MarkdownRenderer>{markdown}</MarkdownRenderer>
          </div>
        )}
      </div>

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-forge)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          onClick={() => setEditing((v) => !v)}
        >
          <Pencil className="size-3.5" />
          {editing ? "Visualizar" : "Editar"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--status-failed)]/40 text-xs text-[var(--status-failed)] hover:bg-[var(--status-failed)]/10 disabled:opacity-40"
          onClick={handleReject}
        >
          {busy === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          Rejeitar
        </button>
        <button
          type="button"
          disabled={busy !== null}
          className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--status-working)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-40"
          onClick={handleApprove}
        >
          {busy === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Aprovar e construir
        </button>
      </footer>
    </div>
  );
}