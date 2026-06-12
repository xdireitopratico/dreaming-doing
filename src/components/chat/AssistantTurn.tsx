import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { ThreadItem } from "@/lib/chat/types";
import { ChatStatusChip } from "./ChatStatusChip";
import { ChatThinking } from "./ChatThinking";
import { ChatNarration } from "./ChatNarration";
import { ChatJobCard } from "./ChatJobCard";
import { ChatQualify } from "./ChatQualify";
import { ChatDone } from "./ChatDone";
import { ChatError } from "./ChatError";


type AssistantTurnProps = {
  item: Extract<ThreadItem, { kind: "assistant" }>;
  onOpenInspector?: (runId: string, tab?: "details" | "timeline" | "changes" | "plan") => void;
  onQualifySelect?: (text: string) => void;
  onResume?: () => void;
  onRollback?: (messageId: string) => void;
};

/**
 * Orquestra o turno assistant — ordem Lovable fixa (plan.md §2):
 * 1. Thought for Xs
 * 2. Narração
 * 3. Status chips (0–2 ativo / até 4 terminal)
 * 4. Mini-card ou plan-teaser
 * 5. Done bubble (se entregou arquivos)
 */
export function AssistantTurn({
  item,
  onOpenInspector,
  onQualifySelect,
  onResume,
  onRollback,
}: AssistantTurnProps) {
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
    !showJobCard &&
    (proseDiffersFromTitle || !showJobCard) &&
    !(showNarration && text?.trim() === item.narration?.trim());
  const hasDelivery =
    (item.miniCard?.fileCount ?? 0) > 0 ||
    (item.miniCard?.editedFile != null && item.miniCard.editedFile !== "");
  const showDone =
    item.finished && item.lastFinishOk && !item.isActive && showJobCard && !planTeaser && hasDelivery;
  const showError = item.finished && item.error;
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

        {showNarration && <ChatNarration text={item.narration!} />}

        {item.statusChips && item.statusChips.length > 0 && (
          <div className="forge-status-chips" data-testid="forge-status-chips">
            {item.statusChips.map((chip) => (
              <ChatStatusChip key={chip} label={chip} />
            ))}
          </div>
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

        {showDone && <ChatDone />}

        {showResponse && (
          <div className="forge-chat-closing-line forge-chat-prose">
            <MarkdownRenderer>{text!}</MarkdownRenderer>
          </div>
        )}

        {showQualify && item.qualify && (
          <ChatQualify data={item.qualify} disabled={item.isActive} onSelect={onQualifySelect} />
        )}
      </div>

      {showError && item.error && (
        <ChatError
          message={item.error}
          onResume={item.resumable ? onResume : undefined}
          onOpenInspector={() => onOpenInspector?.(item.runId)}
        />
      )}

    </article>
  );
}