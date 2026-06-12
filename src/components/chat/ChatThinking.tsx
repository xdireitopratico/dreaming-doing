import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatThinkingProps = {
  startedAtMs?: number;
  active: boolean;
  durationMs?: number;
};

function formatThoughtSeconds(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  return `Thought for ${sec}s`;
}

export function ChatThinking({ startedAtMs, active, durationMs }: ChatThinkingProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const frozenMs = !active && durationMs ? durationMs : null;
  const liveMs =
    startedAtMs && active ? Math.max(500, now - startedAtMs) : (frozenMs ?? durationMs ?? 1000);

  const label = active
    ? `Thinking… ${Math.max(1, Math.round(liveMs / 1000))}s`
    : formatThoughtSeconds(liveMs);

  return (
    <p
      className={cn("forge-chat-thought-line", active && "forge-animate-thinking")}
      data-testid="chat-thinking"
    >
      <span>{label}</span>
      {active && <Loader2 className="size-3 animate-spin" />}
    </p>
  );
}