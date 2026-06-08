import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Check, X, Loader2 } from "lucide-react";
import { ForgeIcon } from "@/components/icons/ForgeIcon";
import type { PendingPlan, PlanStep } from "@/lib/agent-progress";
import { PlanDocumentView } from "@/components/editor/PlanDocumentView";

interface PlanModalProps {
  plan: PendingPlan;
  onClose: () => void;
  onApprove: (steps: PlanStep[], markdown: string) => Promise<void> | void;
  onReject: (reason?: string) => Promise<void> | void;
}

export function PlanModal({ plan, onClose, onApprove, onReject }: PlanModalProps) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [markdown, setMarkdown] = useState(plan.markdown ?? "");

  const handleMarkdownChange = useCallback((md: string) => {
    setMarkdown(md);
  }, []);

  const enabledSteps =
    plan.steps.filter((s) => s.enabled).length > 0
      ? plan.steps.filter((s) => s.enabled)
      : plan.steps;

  const handleApprove = async () => {
    setBusy("approve");
    try {
      await onApprove(enabledSteps, markdown);
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Plano do agente"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 34 }}
        className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center shrink-0">
              <ForgeIcon variant="build" size={18} className="text-[var(--primary)]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Plano FORGE</h2>
              <p className="text-xs text-[var(--forge-silver)] truncate">{plan.mission ?? plan.summary}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy !== null}
            className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--forge-silver)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </header>

        <PlanDocumentView plan={plan} onMarkdownChange={handleMarkdownChange} />

        <footer className="flex items-center gap-2 px-6 py-4 border-t border-[var(--border)] bg-[var(--surface-1)]">
          <button
            onClick={onClose}
            disabled={busy !== null}
            className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40"
          >
            Fechar
          </button>
          <button
            onClick={handleReject}
            disabled={busy !== null}
            className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--foreground)] hover:text-red-400 hover:border-red-400/40 transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            {busy === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
            Rejeitar
          </button>
          <button
            onClick={handleApprove}
            disabled={busy !== null || enabledSteps.length === 0}
            className="ml-auto px-5 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:bg-[var(--primary)]/90 disabled:opacity-30 transition-colors flex items-center gap-1.5"
          >
            {busy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Aprovar e construir
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}