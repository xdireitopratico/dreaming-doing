import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ForgeThinkingVariant = "latency" | "reasoning";

type ForgeThinkingProps = {
  variant: ForgeThinkingVariant;
  /** Timer live — latência imediata após envio da mensagem. */
  startedAtMs?: number;
  /** Duração fixa — raciocínio interno concluído ou em andamento. */
  durationMs?: number;
  active?: boolean;
};

function formatThoughtSeconds(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  return `Thought for ${sec}s`;
}

export function ForgeThinking({
  variant,
  startedAtMs,
  durationMs = 1000,
  active = false,
}: ForgeThinkingProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const frozenMs = !active && durationMs > 0 ? durationMs : null;
  const liveMs =
    variant === "latency" && startedAtMs && active
      ? Math.max(500, now - startedAtMs)
      : frozenMs ?? durationMs;

  const label =
    variant === "latency" && active
      ? `Thinking… ${Math.max(1, Math.round(liveMs / 1000))}s`
      : formatThoughtSeconds(liveMs);

  return (
    <p
      className={cn(
        "forge-chat-thought-line",
        variant === "latency" && "forge-chat-latency-line",
        active && "forge-animate-thinking",
      )}
      data-testid={variant === "latency" ? "forge-latency-thinking" : "forge-reasoning-thinking"}
    >
      <span aria-hidden>💡</span>
      <span>{label}</span>
      {active && <Loader2 className="size-3 animate-spin" />}
    </p>
  );
}