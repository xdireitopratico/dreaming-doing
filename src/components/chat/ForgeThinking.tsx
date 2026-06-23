import { cn } from "@/lib/utils";
import type { ChatThinkingState } from "@/lib/chat/types";

type ForgeThinkingProps = {
  state: ChatThinkingState;
};

/** Topo do AssistantTurn — só estado: «Pensando…» / «Pensou por Xs». Raciocínio no inspector. */
export function ForgeThinking({ state }: ForgeThinkingProps) {
  const label =
    state.status === "active" ? "Pensando…" : `Pensou por ${state.durationSec}s`;

  return (
    <div
      className={cn(
        "forge-chat-thinking-line",
        state.status === "active" && "forge-animate-thinking",
      )}
      data-testid="forge-thinking"
    >
      <span className="forge-chat-thinking-icon" aria-hidden>
        💡
      </span>
      <span className="forge-chat-thinking-label">{label}</span>
    </div>
  );
}