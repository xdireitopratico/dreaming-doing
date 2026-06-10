import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ForgeThinkingProps = {
  durationMs: number;
  active?: boolean;
};

function formatDuration(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  return `Thought for ${sec}s`;
}

export function ForgeThinking({ durationMs, active = false }: ForgeThinkingProps) {
  return (
    <p
      className={cn("forge-chat-thought-line", active && "forge-animate-thinking")}
      data-testid="forge-thinking"
    >
      <span>{formatDuration(durationMs)}</span>
      {active && <Loader2 className="size-3 animate-spin" />}
    </p>
  );
}