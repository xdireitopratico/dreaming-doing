import { useState } from "react";
import { motion } from "framer-motion";
import { Check, X, ListTodo, Maximize2, Loader2 } from "lucide-react";
import type { PendingPlan, PlanStep } from "@/lib/agent-progress";

interface PlanViewerProps {
  plan: PendingPlan;
  onOpen: () => void;
  onApprove: (steps: PlanStep[]) => Promise<void> | void;
  onReject: (reason?: string) => Promise<void> | void;
}

export function PlanViewer({ plan, onOpen, onApprove, onReject }: PlanViewerProps) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const stepCount = plan.steps.length;
  const enabledSteps =
    plan.steps.filter((s) => s.enabled).length > 0
      ? plan.steps.filter((s) => s.enabled)
      : plan.steps;
  const enabledCount = enabledSteps.length;

  const handleApprove = async () => {
    setBusy("approve");
    try {
      await onApprove(enabledSteps);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    setBusy("reject");
    try {
      await onReject();
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ type: "spring", stiffness: 400, damping: 34 }}
      className="w-[200px] h-[80px] border border-[var(--border)] rounded-lg bg-[var(--surface-1)] p-2.5 flex flex-col gap-1.5 cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label="Plano do agente — abrir detalhes"
      data-testid="plan-mini-card"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <ListTodo className="size-3 text-[var(--primary)] shrink-0" />
          <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-[var(--forge-silver)] truncate">
            Plano proposto
          </span>
        </div>
        <Maximize2 className="size-3 text-[var(--forge-muted)] shrink-0" />
      </div>

      <p className="font-mono text-[10px] leading-snug text-[var(--foreground)] line-clamp-2">
        {plan.mission ?? plan.summary}
      </p>

      <div className="flex items-center gap-1.5 mt-auto">
        <span className="font-mono text-[8px] text-[var(--forge-muted)]">
          {enabledCount}/{stepCount} passo{stepCount !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleReject();
            }}
            disabled={busy !== null}
            className="px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--forge-silver)] hover:text-red-400 hover:border-red-400/40 font-mono text-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            aria-label="Rejeitar plano"
          >
            {busy === "reject" ? <Loader2 className="size-2.5 animate-spin" /> : <X className="size-2.5" />}
            Rejeitar
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleApprove();
            }}
            disabled={busy !== null || enabledCount === 0}
            className="px-1.5 py-0.5 rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-mono text-[9px] hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            aria-label="Aprovar plano"
          >
            {busy === "approve" ? <Loader2 className="size-2.5 animate-spin" /> : <Check className="size-2.5" />}
            Aprovar
          </button>
        </div>
      </div>
    </motion.div>
  );
}