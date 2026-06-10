import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ForgeThinkingProps = {
  durationMs: number;
  active?: boolean;
  text?: string;
};

function formatDuration(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  return `Thought for ${sec}s`;
}

export function ForgeThinking({ durationMs, active = false, text }: ForgeThinkingProps) {
  return (
    <div
      className={cn(
        "forge-thinking flex items-center gap-2 py-1",
        active && "forge-animate-thinking",
      )}
      data-testid="forge-thinking"
    >
      <span className="text-[var(--status-thinking)] text-[length:var(--font-thought)] font-[family-name:var(--font-thought)]">
        {formatDuration(durationMs)}
      </span>
      {active && <Loader2 className="size-3 animate-spin text-[var(--status-thinking)]" />}
      {text && !active && (
        <span className="text-[var(--text-muted)] text-xs truncate">{text}</span>
      )}
    </div>
  );
}