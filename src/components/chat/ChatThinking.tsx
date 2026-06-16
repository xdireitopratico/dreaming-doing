import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatThinkingProps = {
  startedAtMs?: number;
  active: boolean;
  durationMs?: number;
  connectionState?: "connected" | "reconnecting" | "disconnected";
};

function formatThoughtSeconds(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  return `Thought for ${sec}s`;
}

export function ChatThinking({ startedAtMs, active, durationMs, connectionState }: ChatThinkingProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const frozenMs = !active && durationMs ? durationMs : null;
  const liveMs =
    startedAtMs && active
      ? Math.max(500, now - startedAtMs)
      : (frozenMs ?? durationMs ?? 1000);

  const isReconnecting = connectionState === "reconnecting";
  const isDisconnected = connectionState === "disconnected";
  const label = isReconnecting
    ? "Reconectando…"
    : isDisconnected
      ? "Conexão perdida — tentando reconectar…"
      : active
        ? "Thinking…"
        : formatThoughtSeconds(liveMs);

  return (
    <p
      className={cn(
        "forge-chat-thought-line",
        active && !isReconnecting && !isDisconnected && "forge-animate-thinking",
        (isReconnecting || isDisconnected) && "forge-chat-thought-line--warning",
      )}
      data-testid="chat-thinking"
      data-connection={connectionState ?? "connected"}
    >
      <span aria-hidden>💡</span>
      <span>{label}</span>
      {(active || isReconnecting || isDisconnected) && (
        <Loader2 className="size-3 animate-spin" />
      )}
    </p>
  );
}