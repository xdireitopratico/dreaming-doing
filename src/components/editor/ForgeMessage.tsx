import { Copy, RotateCcw } from "lucide-react";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { ChatMessage } from "@/lib/chat-types";
import type { AgentRunView } from "@/lib/forge-run";
import { ForgeMiniCard } from "@/components/editor/ForgeMiniCard";
import { ForgeDoneBubble } from "@/components/editor/ForgeDoneBubble";
import { ForgeErrorCard } from "@/components/editor/ForgeErrorCard";

type ForgeMessageProps = {
  role: "user" | "assistant";
  message?: ChatMessage;
  runView?: AgentRunView | null;
  isActive?: boolean;
  isFocused?: boolean;
  showJobCard?: boolean;
  onCopy?: (text: string, msgId: string) => void;
  onUndo?: (msgId: string) => void;
  copiedIds?: Set<string>;
  onResume?: () => void;
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
};

export function ForgeMessage({
  role,
  message,
  runView,
  isActive = false,
  isFocused = false,
  showJobCard = false,
  onCopy,
  onUndo,
  copiedIds,
  onResume,
  onOpenInspector,
}: ForgeMessageProps) {
  if (role === "user" && message) {
    return (
      <article className="forge-chat-item forge-chat-item-user" data-testid="forge-message-user">
        <div className="forge-msg-user">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </article>
    );
  }

  const msgId = message?.id ?? `live-${runView?.runId ?? "forge"}`;
  const isCopied = copiedIds?.has(msgId) ?? false;
  const responseText = runView?.closingText ?? message?.content?.trim() ?? null;

  const showResponse =
    !!responseText &&
    (!showJobCard || (!isActive && !!runView?.finished));

  const showDone =
    !!runView?.finished && !isActive && runView.lastFinishOk === true && showJobCard;

  return (
    <article
      className="forge-chat-item forge-chat-item-assistant group"
      data-testid="forge-message-assistant"
    >
      {showJobCard && runView && onOpenInspector && (
        <ForgeMiniCard
          data={runView.miniCard}
          runId={runView.runId}
          isFocused={isFocused}
          onOpenInspector={onOpenInspector}
        />
      )}

      {showResponse && (
        <div className="forge-chat-closing-line forge-chat-prose" data-testid="assistant-closing-text">
          <MarkdownRenderer>{responseText}</MarkdownRenderer>
        </div>
      )}

      {showDone && <ForgeDoneBubble />}

      {runView?.finished && runView.error && (
        <ForgeErrorCard
          message={runView.error}
          onResume={runView.resumable ? onResume : undefined}
          onOpenInspector={
            onOpenInspector && runView.runId
              ? () => onOpenInspector(runView.runId, "timeline")
              : undefined
          }
        />
      )}

      {runView?.finished && !isActive && responseText && (onCopy || onUndo) && message?.id && (
        <footer className="forge-chat-item-assistant-footer">
          {onUndo && (
            <button
              type="button"
              onClick={() => onUndo(message.id)}
              className="forge-message-action"
              aria-label="Desfazer"
            >
              <RotateCcw className="size-4" />
            </button>
          )}
          {onCopy && (
            <button
              type="button"
              onClick={() => onCopy(responseText, msgId)}
              className="forge-message-action"
              data-copied={isCopied}
              aria-label={isCopied ? "Copiado!" : "Copiar"}
            >
              <Copy className="size-4" />
            </button>
          )}
        </footer>
      )}
    </article>
  );
}