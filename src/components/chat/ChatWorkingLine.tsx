import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatWorkingState } from "@/lib/chat/types";

type ChatWorkingLineProps = {
  working: ChatWorkingState;
};

export function ChatWorkingLine({ working }: ChatWorkingLineProps) {
  const label =
    working.status === "active" ? "Pensando…" : `Pensou por ${working.durationSec}s`;

  return (
    <p
      className={cn("forge-chat-working-line", working.status === "active" && "forge-animate-thinking")}
      data-testid="chat-working-line"
    >
      <span aria-hidden>💡</span>
      <span>{label}</span>
      {working.status === "active" && <Loader2 className="size-3 animate-spin" />}
    </p>
  );
}