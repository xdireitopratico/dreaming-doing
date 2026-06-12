import type { ThreadItem } from "@/lib/chat/types";
import { AssistantTurn } from "./AssistantTurn";
import { ChatToolbar } from "./ChatToolbar";
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
        <ChatToolbar
          text={item.message.content}
          msgId={item.message.id}
          align="start"
          canRollback={!!onRollback}
          onRollback={() => onRollback?.(item.message.id)}
        />
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