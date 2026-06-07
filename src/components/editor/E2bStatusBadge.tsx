import { Link } from "@tanstack/react-router";
import { Box } from "lucide-react";
import { useE2bLiveStatus } from "@/hooks/useE2bLiveStatus";

interface E2bStatusBadgeProps {
  e2bConnected: boolean;
}

export function E2bStatusBadge({ e2bConnected }: E2bStatusBadgeProps) {
  const { ok, label, checking } = useE2bLiveStatus(e2bConnected);

  const dotClass =
    !e2bConnected
      ? "bg-[var(--forge-muted)]"
      : checking
        ? "bg-amber-400 animate-pulse"
        : ok
          ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
          : "bg-red-400";

  return (
    <Link
      to="/api"
      className="forge-e2b-badge inline-flex items-center gap-1.5 rounded-md border border-[var(--forge-border)] px-2 py-1 text-[10px] font-mono text-[var(--forge-muted)] hover:text-[var(--forge-foreground)] hover:bg-[var(--forge-surface-2)] transition-colors"
      title={label}
      data-testid="e2b-status-badge"
    >
      <Box className="size-3 shrink-0" />
      <span className={`size-1.5 rounded-full shrink-0 ${dotClass}`} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}