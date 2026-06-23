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
    <p
      className={cn(
        "forge-chat-thought-line forge-chat-thought-label",
        state.status === "active" && "forge-animate-thinking",
      )}
      data-testid="forge-thinking"
    >
      <span aria-hidden>💡</span>
      <span>{label}</span>
    </p>
  );
}