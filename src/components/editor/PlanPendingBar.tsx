import { Check, ListTodo, Loader2, X } from "lucide-react";
import type { PendingPlan } from "@/lib/agent-progress";

type PlanPendingBarProps = {
  plan: PendingPlan;
  busy?: boolean;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
};

export function PlanPendingBar({ plan, busy, onOpen, onApprove, onReject }: PlanPendingBarProps) {
  const enabledSteps =
    plan.steps.filter((s) => s.enabled).length > 0
      ? plan.steps.filter((s) => s.enabled)
      : plan.steps;
  const taskCount = enabledSteps.length;

  return (
    <div
      className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--primary)]/35 bg-[var(--primary)]/8 px-3 py-2.5"
      data-testid="plan-pending-bar"
      role="region"
      aria-label="Plano aguardando aprovação"
    >
      <ListTodo className="size-4 shrink-0 text-[var(--primary)]" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[var(--foreground)]">Plano pronto para revisão</p>
        <p className="text-[11px] text-[var(--forge-silver)] truncate">
          {plan.mission ?? plan.summary}
          {taskCount > 0 ? ` · ${taskCount} tarefas` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--surface-2)] disabled:opacity-40"
      >
        Ver plano
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={busy}
        className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--foreground)] hover:border-red-400/40 hover:text-red-400 disabled:opacity-40 inline-flex items-center gap-1"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
        Rejeitar
      </button>
      <button
        type="button"
        onClick={onApprove}
        disabled={busy || enabledSteps.length === 0}
        className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90 disabled:opacity-40 inline-flex items-center gap-1"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        Aprovar e construir
      </button>
    </div>
  );
}