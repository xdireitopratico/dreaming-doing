// PlanViewer.tsx — Visualização interativa do plano antes de executar
// Mostra passos com checkboxes, reordenar, aprovar/editar
// Inspiração: Cursor Composer plan approval
import { useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  Sparkles, CheckSquare, Square, Play, X, GripVertical,
  FilePlus, FilePen, Terminal, Package, Eye, Trash2,
  Zap, ChevronRight, Clock, DollarSign, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

export interface PlanStep {
  id: string;
  type: "create_file" | "edit_file" | "shell_exec" | "install_dep" | "observe" | "custom";
  description: string;
  filePath?: string;
  estimatedCost?: number;
  enabled: boolean;
}

interface PlanViewerProps {
  plan: PlanStep[];
  projectId: string;
  onExecute: (steps: PlanStep[]) => void;
  onDismiss: () => void;
  /** Editing mode: user can modify the plan */
  editable?: boolean;
}

const spring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 34,
};

const stepIcons: Record<string, React.ReactNode> = {
  create_file: <FilePlus className="size-3.5" />,
  edit_file: <FilePen className="size-3.5" />,
  shell_exec: <Terminal className="size-3.5" />,
  install_dep: <Package className="size-3.5" />,
  observe: <Eye className="size-3.5" />,
  custom: <Zap className="size-3.5" />,
};

const stepColors: Record<string, string> = {
  create_file: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5",
  edit_file: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  shell_exec: "text-amber-400 border-amber-400/30 bg-amber-400/5",
  install_dep: "text-purple-400 border-purple-400/30 bg-purple-400/5",
  observe: "text-[var(--primary)] border-[var(--primary)]/30 bg-[var(--primary)]/5",
  custom: "text-[var(--text-dim)] border-[var(--border)] bg-[var(--surface-2)]",
};

export function PlanViewer({ plan, onExecute, onDismiss, editable = true }: PlanViewerProps) {
  const [steps, setSteps] = useState(plan);
  const [customInput, setCustomInput] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);

  const toggleStep = useCallback((id: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );
  }, []);

  const removeStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addCustomStep = useCallback(() => {
    if (!customInput.trim()) return;
    setSteps((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        type: "custom",
        description: customInput.trim(),
        enabled: true,
      },
    ]);
    setCustomInput("");
    setAddingCustom(false);
  }, [customInput]);

  const enabledCount = steps.filter((s) => s.enabled).length;
  const totalCost = steps
    .filter((s) => s.enabled)
    .reduce((sum, s) => sum + (s.estimatedCost ?? 0.002), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={spring}
      className="border border-[var(--border)] rounded-xl bg-[var(--surface-1)] overflow-hidden shadow-xl shadow-black/30"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center">
            <Sparkles className="size-3.5 text-[var(--primary)]" />
          </div>
          <div>
            <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--foreground)]">
              Plano do FORGE
            </span>
            <p className="font-mono text-[8px] text-[var(--text-ghost)]">
              Revise e ajuste antes de executar
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]/30 text-[9px] font-mono">
        <span className="text-[var(--text-dim)]">
          {enabledCount}/{steps.length} passo{steps.length !== 1 ? "s" : ""}
        </span>
        <span className="text-[var(--border)]">·</span>
        <span className="flex items-center gap-1">
          <Clock className="size-3 text-[var(--text-ghost)]" />
          <span className="text-[var(--text-dim)]">~{enabledCount * 3}s</span>
        </span>
        <span className="text-[var(--border)]">·</span>
        <span className="flex items-center gap-1">
          <DollarSign className="size-3 text-[var(--text-ghost)]" />
          <span className="text-[var(--text-dim)]">~${totalCost.toFixed(3)}</span>
        </span>
      </div>

      {/* Steps list */}
      <div className="max-h-[320px] overflow-y-auto p-2 space-y-1">
        <AnimatePresence>
          {steps.map((step, i) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8, height: 0 }}
              transition={{ ...spring, delay: i * 0.03 }}
              className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
                step.enabled ? stepColors[step.type] : "opacity-40 border-[var(--border)] bg-transparent"
              }`}
            >
              {/* Toggle */}
              {editable && (
                <button
                  onClick={() => toggleStep(step.id)}
                  className="shrink-0 mt-0.5"
                >
                  {step.enabled ? (
                    <CheckSquare className="size-4 text-[var(--primary)]" />
                  ) : (
                    <Square className="size-4 text-[var(--text-ghost)]" />
                  )}
                </button>
              )}

              {/* Icon */}
              <span className={`shrink-0 mt-0.5 ${step.enabled ? "" : "opacity-50"}`}>
                {stepIcons[step.type]}
              </span>

              {/* Description */}
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[11px] leading-snug text-[var(--foreground)]">
                  {step.description}
                </div>
                {step.filePath && (
                  <div className="font-mono text-[9px] text-[var(--text-ghost)] mt-0.5">
                    {step.filePath}
                  </div>
                )}
              </div>

              {/* Cost */}
              {step.estimatedCost && (
                <span className="font-mono text-[8px] text-[var(--text-ghost)] shrink-0 mt-0.5">
                  ${step.estimatedCost.toFixed(3)}
                </span>
              )}

              {/* Remove */}
              {editable && (
                <button
                  onClick={() => removeStep(step.id)}
                  className="shrink-0 mt-0.5 p-0.5 rounded hover:bg-[var(--destructive)]/10 text-[var(--text-ghost)] hover:text-[var(--destructive)] transition-colors"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Add custom step */}
        {editable && (
          <div className="px-3 pt-2">
            {addingCustom ? (
              <div className="flex items-center gap-2">
                <input
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCustomStep(); }}
                  placeholder="Descreva o passo..."
                  autoFocus
                  className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-[10px] font-mono text-[var(--foreground)] placeholder:text-[var(--text-ghost)] outline-none focus:border-[var(--primary)]/40"
                />
                <button
                  onClick={addCustomStep}
                  className="px-2 py-1.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-mono text-[10px] hover:bg-[var(--primary)]/20 transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => setAddingCustom(false)}
                  className="p-1.5 rounded text-[var(--text-ghost)] hover:text-[var(--foreground)] transition-colors"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingCustom(true)}
                className="flex items-center gap-1.5 text-[9px] font-mono text-[var(--text-ghost)] hover:text-[var(--foreground)] transition-colors"
              >
                <FilePlus className="size-3" />
                Adicionar passo customizado
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border)]">
        <button
          onClick={onDismiss}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--foreground)] font-mono text-[10px] transition-colors"
        >
          <X className="size-3.5" />
          Cancelar
        </button>
        <button
          onClick={() => onExecute(steps.filter((s) => s.enabled))}
          disabled={enabledCount === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-mono text-[10px] tracking-[0.05em] hover:bg-[var(--primary)]/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-sm ml-auto"
        >
          <Play className="size-4" fill="currentColor" />
          Executar {enabledCount > 0 && `${enabledCount} passo${enabledCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    </motion.div>
  );
}
