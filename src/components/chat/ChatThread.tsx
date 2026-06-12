import type { QualifyChoice, ThreadItem } from "@/lib/chat/types";
import { ChatMessage } from "./ChatMessage";

type ChatThreadProps = {
  items: ThreadItem[];
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
  onQualifySelect?: (choice: QualifyChoice) => void;
  onRollback?: (messageId: string, role: "user" | "assistant") => void;
  lastUserMessageId?: string | null;
  lastAssistantMessageId?: string | null;
};

export function ChatThread({
  items,
  onOpenInspector,
  onQualifySelect,
  onRollback,
  lastUserMessageId,
  lastAssistantMessageId,
}: ChatThreadProps) {
  return (
    <div className="forge-chat-stream" role="log" aria-live="polite">
      {items.map((item, index) => {
        // Índice estável — runId muda (__pending__ → UUID) sem remontar o turno inteiro.
        const key =
          item.kind === "user" ? `user-${item.message.id}` : `assistant-slot-${index}`;
        return (
          <ChatMessage
            key={key}
            item={item}
            onOpenInspector={onOpenInspector}
            onQualifySelect={onQualifySelect}
            onRollback={onRollback}
            canRollbackUser={
              item.kind === "user" &&
              !!lastUserMessageId &&
              item.message.id === lastUserMessageId
            }
            canRollbackAssistant={
              item.kind === "assistant" &&
              !!lastAssistantMessageId &&
              !!item.message?.id &&
              item.message.id === lastAssistantMessageId &&
              !item.isActive
            }
          />
        );
      })}
    </div>
  );
}
