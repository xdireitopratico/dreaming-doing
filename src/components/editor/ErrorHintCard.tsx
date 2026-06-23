// ErrorHintCard.tsx — renderiza um ErrorHint como card acionável.
// Substitui o texto cru do `progress.error` por um card com botão/link pro próximo passo.
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { AlertTriangle, Info, AlertCircle, ArrowRight, ExternalLink } from "lucide-react";
import type { ErrorHint } from "@/lib/llm-error-hints";

interface ErrorHintCardProps {
  hint: ErrorHint;
  onAction?: () => void;
}

const severityStyles = {
  info: {
    bg: "bg-sky-400/5",
    border: "border-sky-400/30",
    icon: Info,
    iconClass: "text-sky-400",
    actionClass: "text-sky-400 hover:bg-sky-400/10",
  },
  warning: {
    bg: "bg-amber-400/5",
    border: "border-amber-400/30",
    icon: AlertTriangle,
    iconClass: "text-amber-400",
    actionClass: "text-amber-400 hover:bg-amber-400/10",
  },
  error: {
    bg: "bg-rose-400/5",
    border: "border-rose-400/30",
    icon: AlertCircle,
    iconClass: "text-rose-400",
    actionClass: "text-rose-400 hover:bg-rose-400/10",
  },
} as const;

export function ErrorHintCard({ hint, onAction }: ErrorHintCardProps) {
  const style = severityStyles[hint.severity];
  const Icon = style.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`rounded-lg border p-3 ${style.bg} ${style.border}`}
      role="alert"
      data-code={hint.code}
    >
      <div className="flex items-start gap-2">
        <Icon className={`size-4 mt-0.5 shrink-0 ${style.iconClass}`} />
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] text-[var(--forge-silver)] leading-relaxed">
            {hint.message}
          </p>
          {hint.tip && (
            <p className="font-mono text-[9px] text-[var(--forge-ghost)] mt-1 leading-relaxed">
              {hint.tip}
            </p>
          )}
          {hint.action && (
            <div className="mt-2">
              {hint.link ? (
                <Link
                  to={hint.link}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-current/30 font-mono text-[10px] uppercase tracking-wider transition-colors ${style.actionClass}`}
                  data-testid="error-hint-action"
                >
                  {hint.action}
                  {hint.link.startsWith("http") ? (
                    <ExternalLink className="size-3" />
                  ) : (
                    <ArrowRight className="size-3" />
                  )}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (onAction) {
                      onAction();
                      return;
                    }
                    void navigator.clipboard?.writeText(
                      [hint.message, hint.tip, hint.code].filter(Boolean).join("\n"),
                    );
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-current/30 font-mono text-[10px] uppercase tracking-wider transition-colors ${style.actionClass}`}
                  data-testid="error-hint-action"
                >
                  {hint.action}
                  <ArrowRight className="size-3" />
                </button>
              )}
            </div>
          )}
          <p className="font-mono text-[8px] text-[var(--forge-ghost)] mt-2 opacity-50">
            {hint.code}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
