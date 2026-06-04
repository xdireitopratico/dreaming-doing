// RateLimitIndicator.tsx — Barra de cota + indicador no status bar
// Mostra uso atual vs limite, muda cor conforme se aproxima do teto
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Gauge, AlertTriangle, TrendingUp } from "lucide-react";

interface RateLimitIndicatorProps {
  /** Current usage count */
  used: number;
  /** Maximum allowed */
  limit: number;
  /** Whether to show as compact (status bar) or expanded */
  compact?: boolean;
  /** Label to describe what's being measured */
  label?: string;
}

export function RateLimitIndicator({
  used,
  limit,
  compact = false,
  label = "Requisições",
}: RateLimitIndicatorProps) {
  const ratio = useMemo(() => Math.min(used / limit, 1), [used, limit]);
  const percentage = Math.round(ratio * 100);

  const colorScheme = useMemo(() => {
    if (ratio > 0.9) return { bar: "var(--destructive)", text: "text-[var(--destructive)]", bg: "bg-[var(--destructive)]/10" };
    if (ratio > 0.7) return { bar: "var(--amber-400, #fbbf24)", text: "text-amber-400", bg: "bg-amber-400/10" };
    return { bar: "var(--primary)", text: "text-[var(--primary)]", bg: "bg-[var(--primary)]/10" };
  }, [ratio]);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5" title={`${used}/${limit} ${label}`}>
        <Gauge className="size-3 text-[var(--text-ghost)]" />
        <div className="w-16 h-[3px] rounded-full bg-[var(--surface-2)] overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: colorScheme.bar }}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          />
        </div>
        {ratio > 0.9 && <AlertTriangle className="size-3 text-[var(--destructive)] animate-pulse" />}
        <span className={`font-mono text-[8px] ${colorScheme.text}`}>
          {percentage}%
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-3 rounded-lg border ${ratio > 0.9 ? "border-[var(--destructive)]/30" : "border-[var(--border)]"} ${colorScheme.bg}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp className={`size-3.5 ${colorScheme.text}`} />
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--foreground)]">
            {label}
          </span>
        </div>
        <span className={`font-mono text-[10px] ${colorScheme.text}`}>
          {used} / {limit}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: colorScheme.bar }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        />
      </div>

      {/* Warning */}
      {ratio > 0.9 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1.5 mt-2"
        >
          <AlertTriangle className="size-3 text-[var(--destructive)]" />
          <span className="font-mono text-[9px] text-[var(--destructive)]">
            Limite quase atingido — considere adicionar outra chave
          </span>
        </motion.div>
      )}

      {ratio > 0.7 && ratio <= 0.9 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1.5 mt-2"
        >
          <AlertTriangle className="size-3 text-amber-400" />
          <span className="font-mono text-[9px] text-amber-400">
            {percentage}% do limite utilizado
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}
