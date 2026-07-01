import { useMemo } from "react";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { ErrorHintCard } from "@/components/editor/ErrorHintCard";
import type { ThreadItem } from "@/lib/chat/types";
import { assistantTurnCopyText } from "@/lib/chat/assistant-turn-copy";
import { resolveClosingProse, sanitizeChatProseForDisplay } from "@/lib/chat/stream-prose";
import { loadAgentPreferences } from "@/lib/agent-preferences";

import { llmErrorHint, staleStreamHint, timeoutHint, zombieRunHint } from "@/lib/llm-error-hints";
import { ForgeThinking } from "@/components/chat/ForgeThinking";
import { ChatNarration } from "./ChatNarration";
import { ChatJobCard } from "./ChatJobCard";
import { ChatJobTasksCard } from "./ChatJobTasksCard";
import { ChatToolbar } from "./ChatToolbar";

type AssistantTurnProps = {
  item: Extract<ThreadItem, { kind: "assistant" }>;
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
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
 * Working → Mensagem LLM (abertura) → Mini Card → Mensagem LLM (fechamento)
 */
export function AssistantTurn({
  item,
  onOpenInspector,
  canRollback,
  onRollback,
  onResume,
  onOpenFile,
  onShowOutput,
  onShowPreview,
}: AssistantTurnProps) {
  const failedTurn = item.lastFinishOk === false;
  const rawClosing =
    item.streamText?.trim() ||
    (!failedTurn ? item.error?.trim() : null) ||
    (!item.isActive && !failedTurn ? item.message?.content?.trim() : null) ||
    null;
  const narrationText = sanitizeChatProseForDisplay(item.narration);
  const closingText = resolveClosingProse(narrationText, sanitizeChatProseForDisplay(rawClosing));
  const narrationStreaming = !!item.isActive && !!narrationText;
  const closingStreaming = !!item.isActive && !!item.streamText?.trim();

  const showThinking = !!item.thinking && item.isActive;
  const showNarration = !!narrationText;
  const showClosing = !!closingText;

  const robinActive =
    item.message?.meta && typeof item.message.meta === "object" && item.message.meta.robin === true
      ? true
      : loadAgentPreferences().mode === "robin";

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
        ...llmErrorHint(err, robinActive),
        action: "Continuar execução",
        link: null as string | null,
      };
    }
    if (lower.includes("zumbi") || lower.includes("expirado")) return zombieRunHint();
    if (lower.includes("timeout") && !lower.includes("interrompida")) return timeoutHint();
    if (lower.includes("interrompida")) return staleStreamHint();
    return llmErrorHint(err, robinActive);
  }, [item.error, item.isActive, item.lastFinishOk, item.resumable, robinActive]);

  const showErrorHint = !!errorHint;
  const showJobCard = !!item.miniCard && !showErrorHint;
  const copyText = assistantTurnCopyText(item);

  return (
    <article
      className="forge-chat-item forge-chat-item-assistant"
      data-testid="chat-message-assistant"
    >
      <div className="forge-assistant-turn" data-testid="assistant-turn">
        {showThinking && item.thinking && (
          <ForgeThinking
            state={item.thinking}
            onOpenInspector={
              item.runId && onOpenInspector
                ? () => onOpenInspector(item.runId!, "timeline")
                : undefined
            }
          />
        )}

        {showNarration && <ChatNarration text={narrationText!} streaming={narrationStreaming} />}

        {showJobCard && item.miniCard && (
          <>
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
            <ChatJobTasksCard
              data={item.miniCard}
              isFocused={item.isFocused}
              phase={item.visualPhase ?? item.phase}
            />
          </>
        )}

        {showErrorHint && errorHint && (
          <div className="forge-chat-error-hint" data-testid="assistant-error-hint">
            <ErrorHintCard
              hint={errorHint}
              onAction={
                errorHint.link == null &&
                onResume &&
                (item.resumable || errorHint.code === "agent.stale_stream")
                  ? onResume
                  : undefined
              }
            />
          </div>
        )}

        {showClosing && !showErrorHint && (
          <div
            className={`forge-chat-closing-line forge-chat-prose${closingStreaming ? " forge-chat-streaming-text" : ""}`}
          >
            <MarkdownRenderer variant="chat">{closingText!}</MarkdownRenderer>
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
