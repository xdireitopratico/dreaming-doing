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
      <article className="forge-message forge-message-user" data-testid="forge-message-user">
        <div className="rounded-xl border border-[var(--border-forge)] bg-[var(--bg-input)] px-3 py-2">
          <p className="whitespace-pre-wrap text-[var(--text-primary)] text-sm">{message.content}</p>
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
    <article className="forge-message forge-message-assistant group relative" data-testid="forge-message-assistant">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-accent)] mb-1 block">
        FORGE
      </span>

      {runView?.thinking && (isActive || runView.thinking.active) && (
        <ForgeThinking
          durationMs={runView.thinking.durationMs}
          active={runView.thinking.active}
          text={runView.thinking.text}
        />
      )}

      {showJobCard && runView && onOpenInspector && (
        <div className="my-2">
          <ForgeMiniCard
            data={runView.miniCard}
            runId={runView.runId}
            isFocused={isFocused}
            onOpenInspector={onOpenInspector}
          />
        </div>
      )}

      {runView?.narration && <ForgeNarration text={runView.narration} />}

      {closingText && (
        <p className="text-[var(--text-secondary)] text-sm leading-relaxed whitespace-pre-wrap mt-1">
          {closingText}
        </p>
      )}

      {showDone && <div className="mt-2"><ForgeDoneBubble /></div>}

      {runView?.finished && runView.error && (
        <div className="mt-2">
          <ForgeErrorCard
            message={runView.error}
            onResume={runView.resumable ? onResume : undefined}
            onOpenInspector={
              onOpenInspector && runView.runId
                ? () => onOpenInspector(runView.runId, "timeline")
                : undefined
            }
          />
        </div>
      )}

      {message?.timestamp && runView?.finished && !isActive && (
        <time
          className="block mt-1 text-[9px] text-[var(--text-muted)]"
          dateTime={new Date(message.timestamp).toISOString()}
        >
          {new Date(message.timestamp).toLocaleString("pt-BR", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      )}

      {runView?.finished && !isActive && closingText && (onCopy || onUndo) && message?.id && (
        <footer className="mt-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onUndo && (
            <button
              type="button"
              onClick={() => onUndo(message.id)}
              className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
              aria-label="Desfazer"
            >
              <RotateCcw className="size-4" />
            </button>
          )}
          {onCopy && (
            <button
              type="button"
              onClick={() => onCopy(closingText, msgId)}
              className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
              aria-label={isCopied ? "Copiado!" : "Copiar"}
            >
              <Copy className={isCopied ? "size-4 text-[var(--text-accent)]" : "size-4"} />
            </button>
          )}
        </footer>
      )}
    </article>
  );
}