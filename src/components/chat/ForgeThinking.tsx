import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatThoughtState } from "@/lib/chat/types";

type ForgeThinkingProps = {
  thought: ChatThoughtState;
};

/** Topo do AssistantTurn — «Pensando…» / «Pensou por Xs» com raciocínio colapsável. */
export function ForgeThinking({ thought }: ForgeThinkingProps) {
  const [open, setOpen] = useState(thought.status === "active");
  const hasBody = !!thought.text?.trim();
  const label =
    thought.status === "active"
      ? "Pensando…"
      : `Pensou por ${thought.durationSec}s`;

  return (
    <div className="forge-chat-thought-line" data-testid="forge-thinking">
      {hasBody ? (
        <>
          <button
            type="button"
            className="forge-chat-thought-trigger"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span aria-hidden>💡</span>
            <span>{label}</span>
            {thought.status === "active" && <Loader2 className="size-3 animate-spin" />}
            <ChevronDown
              className={cn("forge-details-chevron size-3.5", open && "forge-details-chevron--open")}
            />
          </button>
          {open && <p className="forge-chat-thought-body">{thought.text}</p>}
        </>
      ) : (
        <p className="forge-chat-thought-label">
          <span aria-hidden>💡</span>
          <span>{label}</span>
          {thought.status === "active" && <Loader2 className="size-3 animate-spin" />}
        </p>
      )}
    </div>
  );
}