// AutoHealingPanel.tsx — Visualização do auto-healing loop do agente
// Mostra tentativas, erros detectados, correções aplicadas
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, AlertTriangle, RefreshCw, CheckCircle2,
  XCircle, FileText, ChevronRight, Clock, ArrowRight,
} from "lucide-react";

export interface HealingAttempt {
  id: string;
  attempt: number;
  maxAttempts: number;
  error: string;
  filePath?: string;
  line?: number;
  fixApplied: string;
  success: boolean;
  timestamp: number;
}

interface AutoHealingPanelProps {
  attempts: HealingAttempt[];
  isHealing: boolean;
  onDismiss: () => void;
  onHelpMeFix: () => void;
}

const spring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 34,
};

export function AutoHealingPanel({
  attempts,
  isHealing,
  onDismiss,
  onHelpMeFix,
}: AutoHealingPanelProps) {
  const currentAttempt = attempts.length + 1;
  const maxAttempts = attempts[0]?.maxAttempts ?? 3;
  const lastSuccess = attempts.find((a) => a.success);

  if (attempts.length === 0 && !isHealing) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-[var(--border)] rounded-lg bg-[var(--surface-1)] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        {isHealing ? (
          <RefreshCw className="size-3.5 text-[var(--primary)] animate-spin" />
        ) : lastSuccess ? (
          <CheckCircle2 className="size-3.5 text-emerald-400" />
        ) : (
          <AlertTriangle className="size-3.5 text-[var(--destructive)]" />
        )}
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--foreground)]">
          {isHealing
            ? `Auto-Healing (${currentAttempt}/${maxAttempts})`
            : lastSuccess
              ? `Corrigido (${attempts.length} tentativa${attempts.length !== 1 ? "s" : ""})`
              : `Falha após ${attempts.length} tentativa${attempts.length !== 1 ? "s" : ""}`}
        </span>
        {!isHealing && (
          <button onClick={onDismiss} className="ml-auto p-0.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] transition-colors">
            <XCircle className="size-3.5" />
          </button>
        )}
      </div>

      {/* Attempts */}
      <div className="p-3 space-y-2">
        <AnimatePresence>
          {attempts.map((attempt) => (
            <motion.div
              key={attempt.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className={`p-2.5 rounded-lg border ${
                attempt.success
                  ? "border-emerald-400/20 bg-emerald-400/5"
                  : "border-[var(--destructive)]/20 bg-[var(--destructive)]/5"
              }`}
            >
              <div className="flex items-start gap-2">
                {attempt.success ? (
                  <CheckCircle2 className="size-3.5 text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="size-3.5 text-[var(--destructive)] mt-0.5 shrink-0" />
                )}

                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* Error */}
                  <div className="font-mono text-[10px] text-[var(--destructive)] leading-snug">
                    {attempt.error}
                  </div>

                  {/* File info */}
                  {attempt.filePath && (
                    <div className="flex items-center gap-1.5 text-[9px] font-mono">
                      <FileText className="size-3 text-[var(--text-ghost)]" />
                      <span className="text-[var(--text-dim)]">
                        {attempt.filePath}
                        {attempt.line && <span className="text-[var(--text-ghost)]">:{attempt.line}</span>}
                      </span>
                    </div>
                  )}

                  {/* Fix applied */}
                  {attempt.success && (
                    <div className="flex items-start gap-1.5">
                      <ArrowRight className="size-3 text-emerald-400 mt-0.5 shrink-0" />
                      <span className="font-mono text-[10px] text-emerald-400 leading-snug">
                        {attempt.fixApplied}
                      </span>
                    </div>
                  )}

                  {/* Timestamp */}
                  <div className="flex items-center gap-1 font-mono text-[8px] text-[var(--text-ghost)]">
                    <Clock className="size-2.5" />
                    {new Date(attempt.timestamp).toLocaleTimeString("pt-BR")}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* In-progress indicator */}
        {isHealing && (
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="flex items-center gap-2 px-3 py-2 text-[var(--primary)]"
          >
            <span className="inline-block size-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
            <span className="font-mono text-[10px]">
              Tentando corrigir... ({currentAttempt}/{maxAttempts})
            </span>
          </motion.div>
        )}
      </div>

      {/* Help button */}
      {!isHealing && !lastSuccess && attempts.length >= maxAttempts && (
        <div className="border-t border-[var(--border)] p-3">
          <button
            onClick={onHelpMeFix}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 text-[var(--primary)] font-mono text-[10px] hover:bg-[var(--primary)]/20 transition-colors"
          >
            <ShieldCheck className="size-4" />
            Help me fix this
          </button>
        </div>
      )}
    </motion.div>
  );
}
