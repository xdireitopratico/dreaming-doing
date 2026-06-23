import type { ClarifyChoice, ThreadItem } from "@/lib/chat/types";
import { ChatMessage } from "./ChatMessage";

type ChatThreadProps = {
  items: ThreadItem[];
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
  onClarifySelect?: (choice: ClarifyChoice) => void;
  onClarifyCustomReply?: (text: string) => void;
  onClarifySkip?: () => void;
  onRollback?: (messageId: string, role: "user" | "assistant") => void;
  lastUserMessageId?: string | null;
  lastAssistantMessageId?: string | null;
  onResume?: () => void;
};

export function ChatThread({
  items,
  onOpenInspector,
  onClarifySelect,
  onClarifyCustomReply,
  onClarifySkip,
  onRollback,
  lastUserMessageId,
  lastAssistantMessageId,
  onResume,
}: ChatThreadProps) {
  return (
    <div className="forge-chat-stream" role="log" aria-live="polite">
      {items.map((item, index) => {
        // Índice estável — runId muda (__pending__ → UUID) sem remontar o turno inteiro.
        const key =
          item.kind === "user"
            ? `user-${item.message.id}`
            : `assistant-${item.runId ?? item.message?.id ?? `fallback-${index}`}`;
        return (
          <ChatMessage
            key={key}
            item={item}
            onOpenInspector={onOpenInspector}
            onClarifySelect={onClarifySelect}
            onClarifyCustomReply={onClarifyCustomReply}
            onClarifySkip={onClarifySkip}
            onRollback={onRollback}
            canRollbackUser={
              item.kind === "user" && !!lastUserMessageId && item.message.id === lastUserMessageId
            }
            canRollbackAssistant={
              item.kind === "assistant" &&
              !!lastAssistantMessageId &&
              !!item.message?.id &&
              item.message.id === lastAssistantMessageId &&
              !item.isActive
            }
            onResume={onResume}
          />
        );
      })}
    </div>
  );
}
