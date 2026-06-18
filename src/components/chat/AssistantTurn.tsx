import { useMemo } from "react";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { ErrorHintCard } from "@/components/editor/ErrorHintCard";
import type { ThreadItem } from "@/lib/chat/types";
import { assistantTurnCopyText } from "@/lib/chat/assistant-turn-copy";
import { resolveClosingProse, sanitizeChatProseForDisplay } from "@/lib/chat/stream-prose";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import { llmErrorHint, timeoutHint, zombieRunHint } from "@/lib/llm-error-hints";
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
  onResume?: () => void;
  /** Fase 2.2 — action chips: handlers opcionais. Chips só aparecem
   *  se o respectivo handler for passado. */
  onOpenFile?: (path: string) => void;
  onShowOutput?: (runId: string) => void;
  onShowPreview?: (runId: string) => void;
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
  onResume,
  onOpenFile,
  onShowOutput,
  onShowPreview,
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
  const showReviewCallout =
    item.miniCard?.status === "done" && (item.miniCard.fileCount ?? 0) > 0;
  const showClosing = !showClarify && !!closingText;

  const errorHint = useMemo(() => {
    const err = item.error?.trim();
    if (!err || item.isActive) return null;
    if (item.lastFinishOk !== false && !item.resumable) return null;
    const lower = err.toLowerCase();
    if (lower.startsWith("dispatch_failed")) {
      return {
        message: "Não foi possível iniciar o agente",
        action: "Tentar novamente",
        link: null,
        severity: "error" as const,
        code: "dispatch_failed",
        tip: "O servidor não conseguiu despachar o trabalho. Verifique INNGEST_EVENT_KEY nas secrets.",
      };
    }
    if (item.resumable || lower.includes("continuar") || lower.includes("checkpoint")) {
      return {
        ...llmErrorHint(err, loadAgentPreferences().mode === "robin"),
        action: "Continuar execução",
        link: null as string | null,
      };
    }
    if (lower.includes("zumbi") || lower.includes("expirado")) return zombieRunHint();
    if (lower.includes("timeout") || lower.includes("interrompida")) return timeoutHint();
    return llmErrorHint(err, loadAgentPreferences().mode === "robin");
  }, [item.error, item.isActive, item.lastFinishOk, item.resumable]);

  const showErrorHint = !!errorHint;
  const copyText = assistantTurnCopyText(item);

  return (
    <article className="forge-chat-item forge-chat-item-assistant" data-testid="chat-message-assistant">
      <div className="forge-assistant-turn" data-testid="assistant-turn">
        {showThinking && item.thinking && (
          <ChatThinking
            startedAtMs={item.thinking.startedAtMs}
            active={item.thinking.active}
            durationMs={item.thinking.durationMs}
            connectionState={item.thinking.connectionState}
            phase={item.phase === "gather" ? "introduction" : null}
          />
        )}

        {showNarration && (
          <ChatNarration text={narrationText!} streaming={narrationStreaming} />
        )}

        {showJobCard && item.miniCard && (
          <ChatJobCard
            data={item.miniCard}
            runId={item.runId}
            isFocused={item.isFocused}
            onClick={() => onOpenInspector?.(item.runId, "timeline")}
            onOpenFile={onOpenFile}
            onShowDiff={(rid) => onOpenInspector?.(rid, "changes")}
            onShowOutput={onShowOutput}
            onShowPreview={onShowPreview}
          />
        )}

        {showReviewCallout && item.runId && (
          <div
            className="chat-review-callout"
            data-testid="assistant-review-callout"
          >
            <span className="chat-review-callout-label">
              {item.miniCard?.fileCount === 1
                ? "1 arquivo modificado"
                : `${item.miniCard?.fileCount ?? 0} arquivos modificados`}
            </span>
            <div className="chat-review-callout-actions">
              <button
                type="button"
                className="chat-review-callout-btn"
                onClick={() => onOpenInspector?.(item.runId!, "changes")}
              >
                Ver diff
              </button>
              {onShowOutput && (
                <button
                  type="button"
                  className="chat-review-callout-btn"
                  onClick={() => onShowOutput(item.runId!)}
                >
                  Ver output
                </button>
              )}
            </div>
          </div>
        )}

        {showClarify && item.clarify && (
          <ChatClarify
            data={item.clarify}
            disabled={item.isActive || !onClarifySelect}
            onSelect={onClarifySelect}
          />
        )}

        {showErrorHint && errorHint && (
          <div className="forge-chat-error-hint" data-testid="assistant-error-hint">
            <ErrorHintCard
              hint={errorHint}
              onAction={
                errorHint.link == null && onResume && item.resumable ? onResume : undefined
              }
            />
          </div>
        )}

        {showClosing && !showErrorHint && (
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
            isActive={item.isActive}
          />
        </div>
      </div>
    </article>
  );
}