import type { ThreadItem } from "@/lib/chat/types";
import { ChatMessage } from "./ChatMessage";

type ChatThreadProps = {
  items: ThreadItem[];
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
  onQualifySelect?: (text: string) => void;
  onResume?: () => void;
  onRollback?: (messageId: string) => void;
  lastUserMessageId?: string | null;
};

export function ChatThread({
  items,
  onOpenInspector,
  onQualifySelect,
  onResume,
  onRollback,
  lastUserMessageId,
}: ChatThreadProps) {
  return (
    <div className="forge-chat-stream" role="log" aria-live="polite">
      {items.map((item) => {
        const key = item.kind === "user" ? `user-${item.message.id}` : `assistant-${item.runId}`;
        return (
          <ChatMessage
            key={key}
            item={item}
            onOpenInspector={onOpenInspector}
            onQualifySelect={onQualifySelect}
            onResume={onResume}
            onRollback={onRollback}
            canRollbackUser={
              item.kind === "user" &&
              !!lastUserMessageId &&
              item.message.id === lastUserMessageId
            }
          />
        );
      })}
    </div>
  );
}
