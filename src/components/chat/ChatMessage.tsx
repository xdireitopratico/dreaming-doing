import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { ThreadItem } from "@/lib-v2/chat-types";
import { ChatThinking } from "./ChatThinking";
import { ChatNarration } from "./ChatNarration";
import { ChatJobCard } from "./ChatJobCard";
import { ChatQualify } from "./ChatQualify";
import { ChatPlan } from "./ChatPlan";
import { ChatDone } from "./ChatDone";
import { ChatError } from "./ChatError";
import { ChatToolbar } from "./ChatToolbar";

type ChatMessageProps = {
  item: ThreadItem;
  onOpenInspector?: (runId: string) => void;
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
    return (
      <article className="forge-chat-item forge-chat-item-user">
        <div className="forge-msg-user">
          <p className="whitespace-pre-wrap">{item.message.content}</p>
        </div>
        <ChatToolbar
          text={item.message.content}
          msgId={item.message.id}
          align="end"
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
  const showPlan = !!item.plan && item.plan.steps.length > 0 && !item.planStatus;
  const showDone = item.finished && item.lastFinishOk && !item.isActive && showJobCard;
  const showError = item.finished && item.error;

  const copyText = text ?? "";

  return (
    <article className="forge-chat-item forge-chat-item-assistant">
      <div className="forge-assistant-turn">
        {showThinking && item.thinking && (
          <ChatThinking
            startedAtMs={item.thinking.startedAtMs ?? Date.now()}
            active={item.thinking.active}
            durationMs={item.thinking.durationMs}
          />
        )}

        {showNarration && <ChatNarration text={item.narration!} />}

        {item.isActive && !hasContent && !showThinking && (
          <p className="forge-msg-text" style={{ color: "var(--text-muted)", fontSize: "12px" }}>
            Pensando…
          </p>
        )}

        {hasContent && (
          <div className="forge-chat-closing-line forge-chat-prose">
            <MarkdownRenderer>{text!}</MarkdownRenderer>
          </div>
        )}

        {showJobCard && item.miniCard && (
          <ChatJobCard
            data={item.miniCard}
            runId={item.runId}
            onClick={() => onOpenInspector?.(item.runId)}
          />
        )}

        {showQualify && item.qualify && (
          <ChatQualify data={item.qualify} disabled={item.isActive} onSelect={onQualifySelect} />
        )}

        {showPlan && item.plan && (
          <ChatPlan plan={item.plan} disabled={item.isActive} onOpenPreview={onOpenInspector} />
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
