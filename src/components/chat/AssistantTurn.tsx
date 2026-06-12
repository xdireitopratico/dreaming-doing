import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { ThreadItem } from "@/lib/chat/types";
import { assistantTurnCopyText } from "@/lib/chat/assistant-turn-copy";
import { ChatThinking } from "./ChatThinking";
import { ChatNarration } from "./ChatNarration";
import { ChatJobCard } from "./ChatJobCard";
import { ChatToolbar } from "./ChatToolbar";
import { ChatQualify } from "./ChatQualify";
import type { QualifyChoice } from "@/lib/chat/types";

type AssistantTurnProps = {
  item: Extract<ThreadItem, { kind: "assistant" }>;
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
  onQualifySelect?: (choice: QualifyChoice) => void;
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
  onQualifySelect,
  canRollback,
  onRollback,
}: AssistantTurnProps) {
  const closingText =
    item.streamText?.trim() ||
    item.error?.trim() ||
    (!item.isActive ? item.message?.content?.trim() : null) ||
    null;
  const narrationText = item.narration?.trim() || null;

  const showThinking = !!item.thinking;
  const showNarration = !!narrationText;
  const showJobCard = !!item.miniCard;
  const showQualify = !!item.qualify?.choices?.length;
  const showClosing =
    !showQualify &&
    !!closingText &&
    (!narrationText || closingText !== narrationText);

  const planTab = item.planTeaser || item.miniCard?.planReady;
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

        {showNarration && <ChatNarration text={narrationText!} />}

        {showJobCard && item.miniCard && (
          <ChatJobCard
            data={item.miniCard}
            runId={item.runId}
            planTeaser={!!item.planTeaser}
            onClick={() =>
              onOpenInspector?.(item.runId, planTab ? "plan" : "timeline")
            }
          />
        )}

        {showQualify && item.qualify && (
          <ChatQualify
            data={item.qualify}
            disabled={item.isActive || !onQualifySelect}
            onSelect={onQualifySelect}
          />
        )}

        {showClosing && (
          <div className="forge-chat-closing-line forge-chat-prose">
            <MarkdownRenderer>{closingText!}</MarkdownRenderer>
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