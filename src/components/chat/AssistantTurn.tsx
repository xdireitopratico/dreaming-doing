import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { ThreadItem } from "@/lib/chat/types";
import { ChatThinking } from "./ChatThinking";
import { ChatNarration } from "./ChatNarration";
import { ChatJobCard } from "./ChatJobCard";

type AssistantTurnProps = {
  item: Extract<ThreadItem, { kind: "assistant" }>;
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
};

/**
 * Fluxo fixo do chat — só 4 blocos, ordem imutável, estado permanente:
 * Thought → Mensagem LLM (abertura) → Mini Card → Mensagem LLM (fechamento)
 */
export function AssistantTurn({ item, onOpenInspector }: AssistantTurnProps) {
  const closingText =
    item.streamText?.trim() ||
    item.error?.trim() ||
    (!item.isActive ? item.message?.content?.trim() : null) ||
    null;
  const narrationText = item.narration?.trim() || null;

  const showThinking = !!item.thinking;
  const showNarration = !!narrationText;
  const showJobCard = !!item.miniCard;
  const showClosing =
    !!closingText && (!narrationText || closingText !== narrationText);

  const planTab = item.planTeaser || item.miniCard?.planReady;

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

        {showClosing && (
          <div className="forge-chat-closing-line forge-chat-prose">
            <MarkdownRenderer>{closingText!}</MarkdownRenderer>
          </div>
        )}
      </div>
    </article>
  );
}