import type { ThreadItem } from "@/lib/chat/types";
import { AssistantTurn } from "./AssistantTurn";
import { ChatUserBubble } from "./ChatUserBubble";
import { ChatToolbar } from "./ChatToolbar";

import type { ClarifyChoice } from "@/lib/chat/types";

type ChatMessageProps = {
  item: ThreadItem;
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
  onClarifySelect?: (choice: ClarifyChoice) => void;
  onRollback?: (messageId: string, role: "user" | "assistant") => void;
  canRollbackUser?: boolean;
  canRollbackAssistant?: boolean;
  onResume?: () => void;
};

/** Roteador: user → bolha | assistant → AssistantTurn (ordem Lovable). */
export function ChatMessage({
  item,
  onOpenInspector,
  onClarifySelect,
  onRollback,
  canRollbackUser,
  canRollbackAssistant,
  onResume,
}: ChatMessageProps) {
  if (item.kind === "user") {
    const isQueued = item.message.meta?.queued === true;
    return (
      <article
        className="forge-chat-item forge-chat-item-user"
        data-testid="chat-message-user"
        data-user-msg-id={item.message.id}
      >
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
      onClarifySelect={onClarifySelect}
      canRollback={canRollbackAssistant && !!messageId}
      onRollback={
        onRollback && canRollbackAssistant && messageId
          ? () => onRollback(messageId, "assistant")
          : undefined
      }
      onResume={onResume}
    />
  );
}