import type { ThreadItem } from "@/lib/chat/types";
import { ChatMessage } from "./ChatMessage";

type ChatThreadProps = {
  items: ThreadItem[];
  onOpenInspector?: (runId: string) => void;
  onQualifySelect?: (text: string) => void;
  onResume?: () => void;
  onRollback?: (messageId: string) => void;
};

export function ChatThread({
  items,
  onOpenInspector,
  onQualifySelect,
  onResume,
  onRollback,
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
          />
        );
      })}
    </div>
  );
}
