import type { ThreadItem } from "@/lib/chat/types";
import { AssistantTurn } from "./AssistantTurn";
import { ChatUserBubble } from "./ChatUserBubble";

type ChatMessageProps = {
  item: ThreadItem;
  onOpenInspector?: (runId: string, tab?: "details" | "timeline" | "changes" | "plan") => void;
  onQualifySelect?: (text: string) => void;
  onResume?: () => void;
  onRollback?: (messageId: string) => void;
};

/** Roteador: user → bolha | assistant → AssistantTurn (ordem Lovable). */
export function ChatMessage({
  item,
  onOpenInspector,
  onQualifySelect,
  onResume,
  onRollback,
}: ChatMessageProps) {
  if (item.kind === "user") {
    const isQueued = item.message.meta?.queued === true;
    return (
      <article className="forge-chat-item forge-chat-item-user" data-testid="chat-message-user">
        <ChatUserBubble content={item.message.content} queued={isQueued} />
      </article>
    );
  }

  return (
    <AssistantTurn
      item={item}
      onOpenInspector={onOpenInspector}
      onQualifySelect={onQualifySelect}
      onResume={onResume}
      onRollback={onRollback}
    />
  );
}