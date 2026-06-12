import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { ThreadItem } from "@/lib/chat/types";
import { assistantTurnCopyText } from "@/lib/chat/assistant-turn-copy";
import { resolveClosingProse, sanitizeChatProseForDisplay } from "@/lib/chat/stream-prose";
import { ChatThinking } from "./ChatThinking";
import { ChatNarration } from "./ChatNarration";
import { ChatJobCard } from "./ChatJobCard";
import { ChatToolbar } from "./ChatToolbar";
import { ChatClarify } from "./ChatClarify";
import type { ClarifyChoice } from "@/lib/chat/types";

type AssistantTurnProps = {
  item: Extract<ThreadItem, { kind: "assistant" }>;
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
  onClarifySelect?: (choice: ClarifyChoice) => void;
  canRollback?: boolean;
  onRollback?: () => void;
};

/**
 * Fluxo fixo do chat — só 4 blocos, ordem imutável, estado permanente:
 * Thought → Mensagem LLM (abertura) → Mini Card → Mensagem LLM (fechamento)
 */
export function AssistantTurn({
  item,
  onOpenInspector,
  onClarifySelect,
  canRollback,
  onRollback,
}: AssistantTurnProps) {
  const rawClosing =
    item.streamText?.trim() ||
    item.error?.trim() ||
    (!item.isActive ? item.message?.content?.trim() : null) ||
    null;
  const narrationText = sanitizeChatProseForDisplay(item.narration);
  const closingText = resolveClosingProse(
    narrationText,
    sanitizeChatProseForDisplay(rawClosing),
  );
  const narrationStreaming = !!item.isActive && !!narrationText;
  const closingStreaming = !!item.isActive && !!item.streamText?.trim();

  const showThinking = !!item.thinking;
  const showNarration = !!narrationText;
  const showJobCard = !!item.miniCard;
  const showClarify = !!item.clarify?.choices?.length;
  const showClosing = !showClarify && !!closingText;

  const copyText = assistantTurnCopyText(item);

  return (
    <article className="forge-chat-item forge-chat-item-assistant" data-testid="chat-message-assistant">
      <div className="forge-assistant-turn" data-testid="assistant-turn">
        {showThinking && item.thinking && (
          <ChatThinking
            startedAtMs={item.thinking.startedAtMs}
            active={item.thinking.active}
            durationMs={item.thinking.durationMs}
          />
        )}

        {showNarration && (
          <ChatNarration text={narrationText!} streaming={narrationStreaming} />
        )}

        {showJobCard && item.miniCard && (
          <ChatJobCard
            data={item.miniCard}
            runId={item.runId}
            onClick={() => onOpenInspector?.(item.runId, "timeline")}
          />
        )}

        {showClarify && item.clarify && (
          <ChatClarify
            data={item.clarify}
            disabled={item.isActive || !onClarifySelect}
            onSelect={onClarifySelect}
          />
        )}

        {showClosing && (
          <div
            className={`forge-chat-closing-line${closingStreaming ? "" : " forge-chat-prose"}`}
          >
            {closingStreaming ? (
              <p className="forge-chat-streaming-text whitespace-pre-wrap">{closingText}</p>
            ) : (
              <MarkdownRenderer variant="chat">{closingText!}</MarkdownRenderer>
            )}
          </div>
        )}

        <div className="forge-assistant-turn-toolbar" data-testid="assistant-turn-toolbar">
          <ChatToolbar
            text={copyText}
            align="start"
            canRollback={canRollback}
            onRollback={onRollback}
          />
        </div>
      </div>
    </article>
  );
}