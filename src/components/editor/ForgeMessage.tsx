import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { ChatMessage } from "@/lib/chat-types";
import type { AgentRunView } from "@/lib/forge-run";
import { ForgeMiniCard } from "@/components/editor/ForgeMiniCard";
import { ForgeThinking } from "@/components/editor/ForgeThinking";
import { ForgeNarration } from "@/components/editor/ForgeNarration";
import { ForgeDoneBubble } from "@/components/editor/ForgeDoneBubble";
import { ForgeErrorCard } from "@/components/editor/ForgeErrorCard";
import { ForgeQualifyPrompt } from "@/components/editor/ForgeQualifyPrompt";
import { ForgeMessageToolbar } from "@/components/editor/ForgeMessageToolbar";
import { formatQualifyChoiceReply, parseQualifyChoices } from "@/lib/qualify-choices";
import type { RollbackRequest } from "@/components/editor/ForgeRollbackFlow";

type ForgeMessageProps = {
  role: "user" | "assistant";
  message?: ChatMessage;
  runView?: AgentRunView | null;
  isActive?: boolean;
  isFocused?: boolean;
  showJobCard?: boolean;
  qualifyInteractive?: boolean;
  running?: boolean;
  onQualifySelect?: (text: string) => void;
  onCopy?: (text: string, msgId: string) => void;
  onRollbackRequest?: (req: RollbackRequest) => void;
  copiedIds?: Set<string>;
  onResume?: () => void;
  onOpenInspector?: (runId: string, tab?: "details" | "timeline" | "changes" | "plan") => void;
};

export function ForgeMessage({
  role,
  message,
  runView,
  isActive = false,
  isFocused = false,
  showJobCard = false,
  qualifyInteractive = false,
  running = false,
  onQualifySelect,
  onCopy,
  onRollbackRequest,
  copiedIds,
  onResume,
  onOpenInspector,
}: ForgeMessageProps) {
  const msgId = message?.id ?? `live-${runView?.runId ?? "forge"}`;
  const isCopied = copiedIds?.has(msgId) ?? false;
  const rollbackDisabled = running || isActive || !message?.id;
  const canRollback = !!onRollbackRequest && !!message?.id;

  if (role === "user" && message) {
    const copyText = message.content?.trim() ?? "";
    const isQueued = message.meta?.queued === true;
    return (
      <article className="forge-chat-item forge-chat-item-user" data-testid="forge-message-user">
        <div className={`forge-msg-user${isQueued ? " forge-msg-user--queued" : ""}`}>
          <p className="whitespace-pre-wrap">{message.content}</p>
          {isQueued && <span className="forge-msg-queued-label">Na fila…</span>}
        </div>
        {onCopy && (
          <ForgeMessageToolbar
            copyText={copyText}
            msgId={msgId}
            copied={isCopied}
            align="end"
            rollbackDisabled={rollbackDisabled}
            onCopy={onCopy}
            onRollback={
              canRollback
                ? () => onRollbackRequest({ messageId: message.id, role: "user" })
                : undefined
            }
          />
        )}
      </article>
    );
  }

  const sessionTitle = runView?.miniCard.title?.trim() ?? null;
  const responseText = runView?.closingText ?? message?.content?.trim() ?? null;
  const qualifyPrompt = responseText ? parseQualifyChoices(responseText) : null;
  const showQualifyPrompt = !!qualifyPrompt && qualifyInteractive && !!onQualifySelect;

  const latency = runView?.latencyThinking;
  const showLatencyThinking =
    !!latency && (latency.active || (latency.durationMs != null && latency.durationMs > 0));

  const showNarration =
    !!runView?.narration?.trim() &&
    !(runView?.closingText?.trim() && runView.closingText.includes(runView.narration.trim()));

  const isConversational =
    runView?.conversational === true ||
    (runView?.finished === true && !showJobCard && !!responseText?.trim());

  const proseDiffersFromTitle = !sessionTitle || !responseText || responseText !== sessionTitle;

  const showResponse =
    !!responseText &&
    !showQualifyPrompt &&
    (isConversational || proseDiffersFromTitle || !showJobCard);

  const hasDelivery =
    (runView?.miniCard.fileCount ?? 0) > 0 ||
    (runView?.miniCard.editedFile != null && runView.miniCard.editedFile !== "");
  const showDone =
    !!runView?.finished &&
    !isActive &&
    runView.lastFinishOk === true &&
    showJobCard &&
    hasDelivery;

  return (
    <article
      className="forge-chat-item forge-chat-item-assistant group"
      data-testid="forge-message-assistant"
    >
      <div className="forge-assistant-turn">
        {showLatencyThinking && latency && (
          <ForgeThinking
            variant="latency"
            startedAtMs={latency.startedAtMs}
            durationMs={latency.durationMs}
            active={latency.active}
          />
        )}

        {showNarration && runView?.narration && <ForgeNarration text={runView.narration} />}

        {showResponse && (
          <div
            className="forge-chat-closing-line forge-chat-prose"
            data-testid="assistant-closing-text"
          >
            <MarkdownRenderer>{responseText}</MarkdownRenderer>
          </div>
        )}

        {showJobCard && runView && onOpenInspector && (
          <ForgeMiniCard
            data={runView.miniCard}
            runId={runView.runId}
            isFocused={isFocused}
            onOpenInspector={onOpenInspector}
          />
        )}

        {showQualifyPrompt && qualifyPrompt && (
          <ForgeQualifyPrompt
            data={qualifyPrompt}
            disabled={isActive}
            onSelect={(label) => {
              const choice = qualifyPrompt.choices.find((c) => c.label === label);
              onQualifySelect(choice ? formatQualifyChoiceReply(choice) : label);
            }}
          />
        )}

        {showDone && <ForgeDoneBubble />}
      </div>

      {runView?.finished && runView.error && (
        <ForgeErrorCard
          message={runView.error}
          onResume={runView.resumable ? onResume : undefined}
          onOpenInspector={
            onOpenInspector && runView.runId
              ? () => onOpenInspector(runView.runId, "details")
              : undefined
          }
        />
      )}

      {onCopy && responseText && (
        <ForgeMessageToolbar
          copyText={responseText}
          msgId={msgId}
          copied={isCopied}
          align="start"
          rollbackDisabled={rollbackDisabled}
          onCopy={onCopy}
          onRollback={
            canRollback
              ? () => onRollbackRequest({ messageId: message!.id, role: "assistant" })
              : undefined
          }
        />
      )}
    </article>
  );
}