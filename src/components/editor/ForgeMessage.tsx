import { Copy, RotateCcw } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-types";
import type { AgentRunView } from "@/lib/forge-run";
import { ForgeThinking } from "@/components/editor/ForgeThinking";
import { ForgeNarration } from "@/components/editor/ForgeNarration";
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
        <div className="forge-msg-user-outline">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </article>
    );
  }

  const msgId = message?.id ?? `live-${runView?.runId ?? "forge"}`;
  const isCopied = copiedIds?.has(msgId) ?? false;
  const closingText = runView?.closingText ?? message?.content?.trim() ?? null;
  const showDone =
    !!runView?.finished &&
    !isActive &&
    runView.lastFinishOk === true &&
    showJobCard;

  return (
    <article
      className="forge-chat-item forge-chat-item-assistant relative group"
      data-testid="forge-message-assistant"
    >
      <span className="forge-chat-sender forge-chat-sender-assistant shrink-0">FORGE</span>

      {runView?.thinking && (isActive || runView.thinking.active) && (
        <ForgeThinking
          durationMs={runView.thinking.durationMs}
          active={runView.thinking.active}
        />
      )}

      {showJobCard && runView && onOpenInspector && (
        <ForgeMiniCard
          data={runView.miniCard}
          runId={runView.runId}
          isFocused={isFocused}
          onOpenInspector={onOpenInspector}
        />
      )}

      {runView?.narration && <ForgeNarration text={runView.narration} />}

      {closingText && (
        <p className="forge-chat-closing-line" data-testid="assistant-closing-text">
          {closingText}
        </p>
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

      {message?.timestamp && runView?.finished && !isActive && (
        <time className="forge-turn-timestamp" dateTime={new Date(message.timestamp).toISOString()}>
          {new Date(message.timestamp).toLocaleString("pt-BR", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      )}

      {runView?.finished && !isActive && closingText && (onCopy || onUndo) && message?.id && (
        <footer className="forge-chat-item-assistant-footer mt-2 flex items-center justify-end gap-1 opacity-60 hover:opacity-100 transition-opacity">
          {onUndo && (
            <button
              type="button"
              onClick={() => onUndo(message.id)}
              className="p-1.5 rounded hover:bg-[var(--forge-surface-2)] transition-colors text-[var(--forge-muted)] hover:text-[var(--forge-destructive)]"
              aria-label="Desfazer"
            >
              <RotateCcw className="size-4" />
            </button>
          )}
          {onCopy && (
            <button
              type="button"
              onClick={() => onCopy(closingText, msgId)}
              className="p-1.5 rounded hover:bg-[var(--forge-surface-2)] transition-colors text-[var(--forge-muted)] hover:text-[var(--forge-foreground)]"
              aria-label={isCopied ? "Copiado!" : "Copiar"}
            >
              <Copy className={isCopied ? "size-4 text-[var(--forge-primary)]" : "size-4"} />
            </button>
          )}
        </footer>
      )}
    </article>
  );
}