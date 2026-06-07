// PlanViewer.tsx — Mini card collapsed (200x80px) do plano no ChatStream.
// Click → abre PlanModal grande. UX simples: card de notificação que
// resume o plano + 2 ações inline (Aprovar/Rejeitar).
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, ListTodo, Maximize2, Loader2 } from "lucide-react";
import { PlanModal } from "@/components/editor/PlanModal";
import type { PendingPlan, PlanStep } from "@/hooks/useSSE";

interface PlanViewerProps {
  plan: PendingPlan;
  onApprove: (steps: PlanStep[]) => Promise<void> | void;
  onReject: (reason?: string) => Promise<void> | void;
}

export function PlanViewer({ plan, onApprove, onReject }: PlanViewerProps) {
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const stepCount = plan.steps.length;
  const enabledCount = plan.steps.filter((s) => s.enabled).length;

  const handleApprove = async (steps: PlanStep[]) => {
    setBusy("approve");
    try {
      await onApprove(steps);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async (reason?: string) => {
    setBusy("reject");
    try {
      await onReject(reason);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ type: "spring", stiffness: 400, damping: 34 }}
        className="w-[200px] h-[80px] border border-[var(--border)] rounded-lg bg-[var(--surface-1)] p-2.5 flex flex-col gap-1.5 cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
        onClick={() => setShowModal(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowModal(true);
          }
        }}
        aria-label="Plano do agente — abrir detalhes"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <ListTodo className="size-3 text-[var(--primary)] shrink-0" />
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-[var(--text-dim)] truncate">
              Plano proposto
            </span>
          </div>
          <Maximize2 className="size-3 text-[var(--text-ghost)] shrink-0" />
        </div>

        <p className="font-mono text-[10px] leading-snug text-[var(--foreground)] line-clamp-2">
          {plan.summary}
        </p>

        <div className="flex items-center gap-1.5 mt-auto">
          <span className="font-mono text-[8px] text-[var(--text-ghost)]">
            {enabledCount}/{stepCount} passo{stepCount !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleReject();
              }}
              disabled={busy !== null}
              className="px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--destructive)] hover:border-[var(--destructive)]/40 font-mono text-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              aria-label="Rejeitar plano"
            >
              {busy === "reject" ? <Loader2 className="size-2.5 animate-spin" /> : <X className="size-2.5" />}
              Rejeitar
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleApprove(plan.steps.filter((s) => s.enabled));
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

      <AnimatePresence>
        {showModal && (
          <PlanModal
            plan={plan}
            onClose={() => setShowModal(false)}
            onApprove={async (steps) => {
              await handleApprove(steps);
              setShowModal(false);
            }}
            onReject={async (reason) => {
              await handleReject(reason);
              setShowModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
