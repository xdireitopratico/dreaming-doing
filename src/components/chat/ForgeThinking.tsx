import { cn } from "@/lib/utils";
import type { ChatThinkingState } from "@/lib/chat/types";

type ForgeThinkingProps = {
  state: ChatThinkingState;
  onOpenInspector?: () => void;
};

/** Topo do AssistantTurn — estado «Pensando…» / «Pensou por Xs». Clique abre o raciocínio no inspector. */
export function ForgeThinking({ state, onOpenInspector }: ForgeThinkingProps) {
  const label =
    state.status === "active" ? "Pensando…" : `Pensou por ${state.durationSec}s`;

  return (
    <button
      type="button"
      className={cn(
        "forge-chat-thinking-line",
        state.status === "active" && "forge-animate-thinking",
        onOpenInspector && "forge-chat-thinking-line--clickable",
      )}
      data-testid="forge-thinking"
      onClick={onOpenInspector}
      disabled={!onOpenInspector}
      title="Ver raciocínio no inspector"
      aria-label={`${label}. Ver raciocínio no inspector`}
    >
      <span className="forge-chat-thinking-icon" aria-hidden>
        💡
      </span>
      <span className="forge-chat-thinking-label">{label}</span>
    </button>
  );
}