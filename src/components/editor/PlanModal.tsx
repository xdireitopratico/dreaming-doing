// PlanModal.tsx — Modal grande do plano. Cobre o preview (com chat aparente),
// mostra rationale + passos detalhados + 2 botões (Aprovar/Rejeitar) com
// loading state.
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Check, X, FilePlus, FilePen, Terminal, Package, Eye, Zap,
  Clock, DollarSign, Loader2, ListTodo, CheckSquare, Square,
} from "lucide-react";
import { ForgeIcon } from "@/components/icons/ForgeIcon";
import type { PendingPlan, PlanStep } from "@/hooks/useSSE";

interface PlanModalProps {
  plan: PendingPlan;
  onClose: () => void;
  onApprove: (steps: PlanStep[]) => Promise<void> | void;
  onReject: (reason?: string) => Promise<void> | void;
}

const stepIcons: Record<string, React.ReactNode> = {
  create_file: <FilePlus className="size-4" />,
  edit_file: <FilePen className="size-4" />,
  shell_exec: <Terminal className="size-4" />,
  install_dep: <Package className="size-4" />,
  observe: <Eye className="size-4" />,
  custom: <Zap className="size-4" />,
};

const stepColors: Record<string, string> = {
  create_file: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5",
  edit_file: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  shell_exec: "text-amber-400 border-amber-400/30 bg-amber-400/5",
  install_dep: "text-purple-400 border-purple-400/30 bg-purple-400/5",
  observe: "text-[var(--primary)] border-[var(--primary)]/30 bg-[var(--primary)]/5",
  custom: "text-[var(--text-dim)] border-[var(--border)] bg-[var(--surface-2)]",
};

export function PlanModal({ plan, onClose, onApprove, onReject }: PlanModalProps) {
  const [steps, setSteps] = useState<PlanStep[]>(plan.steps);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const enabledCount = steps.filter((s) => s.enabled).length;
  const totalCost = steps
    .filter((s) => s.enabled)
    .reduce((sum, s) => sum + (s.estimatedCost ?? 0.002), 0);

  const toggleStep = (id: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const handleApprove = async () => {
    setBusy("approve");
    try {
      await onApprove(steps.filter((s) => s.enabled));
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
        className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center">
              <ForgeIcon variant="build" size={18} className="text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="font-mono text-xs tracking-[0.1em] uppercase text-[var(--foreground)]">
                Plano do FORGE
              </h2>
              <p className="font-mono text-[10px] text-[var(--text-ghost)]">
                Revise e ajuste antes de executar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy !== null}
            className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] transition-colors disabled:opacity-40"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-2)]/30">
          <h3 className="font-mono text-sm text-[var(--foreground)] leading-snug">
            {plan.summary}
          </h3>
          {plan.rationale && (
            <p className="font-mono text-[11px] text-[var(--text-dim)] mt-2 leading-relaxed">
              {plan.rationale}
            </p>
          )}
          <div className="flex items-center gap-4 mt-3 font-mono text-[10px]">
            <span className="text-[var(--text-dim)]">
              {enabledCount}/{steps.length} passo{steps.length !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1 text-[var(--text-dim)]">
              <Clock className="size-3 text-[var(--text-ghost)]" />
              ~{enabledCount * 3}s
            </span>
            <span className="flex items-center gap-1 text-[var(--text-dim)]">
              <DollarSign className="size-3 text-[var(--text-ghost)]" />
              ~${totalCost.toFixed(3)}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {steps.map((step, i) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
              className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors ${
                step.enabled ? stepColors[step.type] : "opacity-40 border-[var(--border)] bg-transparent"
              }`}
            >
              <button
                onClick={() => toggleStep(step.id)}
                className="shrink-0 mt-0.5"
                disabled={busy !== null}
                aria-label={step.enabled ? "Desabilitar passo" : "Habilitar passo"}
              >
                {step.enabled ? (
                  <CheckSquare className="size-4 text-[var(--primary)]" />
                ) : (
                  <Square className="size-4 text-[var(--text-ghost)]" />
                )}
              </button>
              <span className={`shrink-0 mt-0.5 ${step.enabled ? "" : "opacity-50"}`}>
                {stepIcons[step.type]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs leading-snug text-[var(--foreground)]">
                  {step.description}
                </div>
                {step.filePath && (
                  <div className="font-mono text-[10px] text-[var(--text-ghost)] mt-1">
                    {step.filePath}
                  </div>
                )}
              </div>
              {step.estimatedCost !== undefined && (
                <span className="font-mono text-[9px] text-[var(--text-ghost)] shrink-0 mt-0.5">
                  ${step.estimatedCost.toFixed(3)}
                </span>
              )}
            </motion.div>
          ))}
        </div>

        <footer className="flex items-center gap-2 px-6 py-4 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            disabled={busy !== null}
            className="px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--foreground)] font-mono text-[11px] transition-colors disabled:opacity-40"
          >
            Fechar
          </button>
          <button
            onClick={handleReject}
            disabled={busy !== null}
            className="px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--destructive)] hover:border-[var(--destructive)]/40 font-mono text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {busy === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
            Rejeitar
          </button>
          <button
            onClick={handleApprove}
            disabled={busy !== null || enabledCount === 0}
            className="ml-auto px-5 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-mono text-[11px] tracking-[0.05em] hover:bg-[var(--primary)]/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center gap-1.5"
          >
            {busy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Aprovar {enabledCount > 0 && `(${enabledCount})`}
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}
