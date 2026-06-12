import type { ThreadItem } from "@/lib/chat/types";
import { AssistantTurn } from "./AssistantTurn";
import { ChatUserBubble } from "./ChatUserBubble";
import { ChatToolbar } from "./ChatToolbar";

type ChatMessageProps = {
  item: ThreadItem;
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
  onRollback?: (messageId: string, role: "user" | "assistant") => void;
  canRollbackUser?: boolean;
  canRollbackAssistant?: boolean;
};

/** Roteador: user → bolha | assistant → AssistantTurn (ordem Lovable). */
export function ChatMessage({
  item,
  onOpenInspector,
  onRollback,
  canRollbackUser,
  canRollbackAssistant,
}: ChatMessageProps) {
  if (item.kind === "user") {
    const isQueued = item.message.meta?.queued === true;
    return (
      <article className="forge-chat-item forge-chat-item-user" data-testid="chat-message-user">
        <ChatUserBubble content={item.message.content} queued={isQueued} />
        <ChatToolbar
          text={item.message.content}
          align="end"
          canRollback={canRollbackUser}
          onRollback={
            onRollback && canRollbackUser
              ? () => onRollback(item.message.id, "user")
              : undefined
          }
        />
      </article>
    );
  }

  const messageId = item.message?.id;
  return (
    <AssistantTurn
      item={item}
      onOpenInspector={onOpenInspector}
      canRollback={canRollbackAssistant && !!messageId}
      onRollback={
        onRollback && canRollbackAssistant && messageId
          ? () => onRollback(messageId, "assistant")
          : undefined
      }
    />
  );
}