import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { ThreadItem } from "@/lib/chat/types";
import { ForgeStatusChip } from "@/components/editor/ForgeStatusChip";
import { ChatThinking } from "./ChatThinking";
import { ChatNarration } from "./ChatNarration";
import { ChatJobCard } from "./ChatJobCard";
import { ChatQualify } from "./ChatQualify";
import { ChatDone } from "./ChatDone";
import { ChatError } from "./ChatError";
import { ChatToolbar } from "./ChatToolbar";
import { ChatUserBubble } from "./ChatUserBubble";

type ChatMessageProps = {
  item: ThreadItem;
  onOpenInspector?: (runId: string, tab?: "details" | "timeline" | "changes" | "plan") => void;
  onQualifySelect?: (text: string) => void;
  onResume?: () => void;
  onRollback?: (messageId: string) => void;
};

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

  const text = item.streamText ?? item.message?.content?.trim() ?? null;
  const hasContent = !!text?.trim();
  const showThinking =
    !!item.thinking && (item.thinking.active || (item.thinking.durationMs ?? 0) > 0);
  const showNarration = !!item.narration?.trim();
  const showJobCard = !!item.miniCard && !item.qualify;
  const showQualify = !!item.qualify && onQualifySelect;
  const planTeaser = !!item.planTeaser;
  const sessionTitle = item.miniCard?.title?.trim() ?? null;
  const proseDiffersFromTitle = !sessionTitle || !text || text !== sessionTitle;
  const showResponse =
    hasContent &&
    !showQualify &&
    !planTeaser &&
    (proseDiffersFromTitle || !showJobCard) &&
    !(showNarration && text?.trim() === item.narration?.trim());
  const hasDelivery =
    (item.miniCard?.fileCount ?? 0) > 0 ||
    (item.miniCard?.editedFile != null && item.miniCard.editedFile !== "");
  const showDone =
    item.finished && item.lastFinishOk && !item.isActive && showJobCard && !planTeaser && hasDelivery;
  const showError = item.finished && item.error;

  const copyText = text ?? "";

  return (
    <article className="forge-chat-item forge-chat-item-assistant" data-testid="chat-message-assistant">
      <div className="forge-assistant-turn">
        {showThinking && item.thinking && (
          <ChatThinking
            startedAtMs={item.thinking.startedAtMs}
            active={item.thinking.active}
            durationMs={item.thinking.durationMs}
          />
        )}

        {showNarration && <ChatNarration text={item.narration!} />}

        {item.statusChips && item.statusChips.length > 0 && (
          <div className="forge-status-chips" data-testid="forge-status-chips">
            {item.statusChips.map((chip) => (
              <ForgeStatusChip key={chip} label={chip} />
            ))}
          </div>
        )}

        {showResponse && (
          <div className="forge-chat-closing-line forge-chat-prose">
            <MarkdownRenderer>{text!}</MarkdownRenderer>
          </div>
        )}

        {item.isActive && !hasContent && !showThinking && !showNarration && (
          <p className="forge-msg-text" style={{ color: "var(--text-muted)", fontSize: "12px" }}>
            Pensando…
          </p>
        )}

        {showJobCard && item.miniCard && (
          <ChatJobCard
            data={item.miniCard}
            runId={item.runId}
            planTeaser={planTeaser}
            onClick={() =>
              onOpenInspector?.(item.runId, planTeaser || item.miniCard?.planReady ? "plan" : "details")
            }
          />
        )}

        {showQualify && item.qualify && (
          <ChatQualify data={item.qualify} disabled={item.isActive} onSelect={onQualifySelect} />
        )}

        {showDone && <ChatDone />}
      </div>

      {showError && item.error && (
        <ChatError
          message={item.error}
          onResume={item.resumable ? onResume : undefined}
          onOpenInspector={() => onOpenInspector?.(item.runId)}
        />
      )}

      {copyText && (
        <ChatToolbar
          text={copyText}
          msgId={item.message?.id ?? item.runId}
          align="start"
          canRollback={!!onRollback && !!item.message?.id}
          onRollback={() => item.message?.id && onRollback?.(item.message.id)}
        />
      )}
    </article>
  );
}