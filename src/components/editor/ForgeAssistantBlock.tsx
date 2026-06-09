import { Copy, RotateCcw } from "lucide-react";
import type { ChatMessage } from "@/components/editor/ChatInput";
import type { AgentProgress, PendingPlan, PlanStep } from "@/lib/agent-progress";
import { AgentJobMiniCard } from "@/components/editor/AgentJobMiniCard";
import { storedPlanFromMessage } from "@/lib/plan-message-meta";
import { isAgentJobMessage } from "@/lib/assistant-run-progress";

interface ForgeAssistantBlockProps {
  message?: ChatMessage;
  progress: AgentProgress | null;
  isActive: boolean;
  runId?: string;
  pendingPlan?: PendingPlan | null;
  onCopy?: (text: string, msgId: string) => void;
  onUndo?: (msgId: string) => void;
  copiedIds?: Set<string>;
  estimatedTokens?: number;
  showTokens?: boolean;
  onReopenPlan?: () => void;
  onPlanApprove?: (steps: PlanStep[]) => void;
  onPlanReject?: (reason?: string) => void;
  onResume?: () => void;
  onOpenJobWorkspace?: (runId: string) => void;
  jobWorkspaceRunId?: string | null;
}

function resolveClosingText(
  progress: AgentProgress | null,
  message?: ChatMessage,
  isBuildRun?: boolean,
): string | null {
  const messageText = message?.content?.trim() || null;
  if (!isBuildRun) {
    return progress?.streamText?.trim() || messageText;
  }
  if (progress) {
    return progress.streamText?.trim() || progress.summary?.trim() || messageText;
  }
  return messageText;
}

function JobDoneBubble() {
  return (
    <div className="lovable-done-bubble" data-testid="assistant-done-footer">
      <span className="lovable-done-bubble-label">Done</span>
    </div>
  );
}

export function ForgeAssistantBlock({
  message,
  progress,
  isActive,
  runId,
  pendingPlan,
  onCopy,
  onUndo,
  copiedIds,
  estimatedTokens = 0,
  showTokens = false,
  onReopenPlan,
  onPlanApprove,
  onPlanReject,
  onResume,
  onOpenJobWorkspace,
  jobWorkspaceRunId,
}: ForgeAssistantBlockProps) {
  const msgId = message?.id ?? `live-${runId ?? "forge"}`;
  const isCopied = copiedIds?.has(msgId) ?? false;

  const effectiveProgress = progress;
  const storedPlan = storedPlanFromMessage(message);
  const livePlan = pendingPlan && (!runId || pendingPlan.runId === runId) ? pendingPlan : null;
  const planForRun = livePlan ?? (storedPlan?.status === "pending" ? storedPlan.plan : null);
  const rejectedPlan = storedPlan?.status === "rejected" ? storedPlan.plan : null;
  const approvedPlan = storedPlan?.status === "approved" ? storedPlan.plan : null;

  const isBuildRun = !!runId || isAgentJobMessage(message);
  const showJobBubble =
    isBuildRun &&
    !!effectiveProgress &&
    (!!runId ||
      isActive ||
      (effectiveProgress.timeline?.length ?? 0) > 0 ||
      (effectiveProgress.tools?.length ?? 0) > 0);

  const closingText = resolveClosingText(effectiveProgress, message, showJobBubble);

  const showDoneBubble =
    !!runId &&
    !!effectiveProgress?.finished &&
    !isActive &&
    showJobBubble &&
    effectiveProgress.lastFinishOk === true &&
    !effectiveProgress.canceled;

  const isPersistedMessage = !!message?.id && !String(message.id).startsWith("live-");
  const canShowFooter =
    !!effectiveProgress?.finished && !isActive && isPersistedMessage && !!closingText;

  const turnTimestamp = message?.timestamp;

  return (
    <article className="forge-chat-item forge-chat-item-assistant relative group">
      <div className="flex items-start justify-between gap-2">
        <span className="forge-chat-sender forge-chat-sender-assistant shrink-0">FORGE</span>
        {showTokens && estimatedTokens > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[10px] font-mono text-[var(--forge-primary)]">
            <span>~{estimatedTokens.toLocaleString()} tokens</span>
          </div>
        )}
      </div>

      {/* Mini card com lista atômica de tarefas */}
      {showJobBubble && effectiveProgress && (
        <AgentJobMiniCard
          progress={effectiveProgress}
          runId={runId}
          isActive={isActive}
          isFocused={!!runId && jobWorkspaceRunId === runId}
          pendingPlan={planForRun}
          onOpen={onOpenJobWorkspace}
        />
      )}

      {/* Plano aprovado (histórico) */}
      {approvedPlan && !planForRun && (
        <section
          className="my-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/60 overflow-hidden"
          aria-label="Plano aprovado"
          data-testid="plan-approved-history"
        >
          <header className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]">
            <span className="text-xs font-medium text-[var(--foreground)]">Plano aprovado</span>
          </header>
          <div className="max-h-[360px] overflow-hidden">
            <p className="p-4 text-sm text-[var(--forge-silver)]">{approvedPlan.mission ?? approvedPlan.summary}</p>
          </div>
        </section>
      )}

      {/* Texto de fechamento / narração */}
      {closingText ? (
        <p
          className="forge-chat-live-line forge-chat-closing-text text-[var(--forge-silver)] text-[13px] leading-relaxed whitespace-pre-wrap"
          data-testid="assistant-closing-text"
        >
          {closingText}
        </p>
      ) : null}

      {showDoneBubble && <JobDoneBubble />}

      {turnTimestamp && effectiveProgress?.finished && !isActive && (
        <time className="lovable-turn-timestamp" dateTime={new Date(turnTimestamp).toISOString()}>
          {new Date(turnTimestamp).toLocaleString("pt-BR", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      )}

      {/* Erro */}
      {effectiveProgress?.finished && effectiveProgress.error && (
        <section
          className="my-2 rounded-lg border border-amber-400/35 bg-amber-400/8 px-3 py-2.5"
          data-testid="assistant-turn-error"
        >
          <p className="text-[12px] text-[var(--forge-silver)] leading-relaxed">
            {effectiveProgress.error}
          </p>
          {effectiveProgress.resumable && onResume && (
            <button
              type="button"
              className="mt-2 font-mono text-[10px] text-[var(--forge-primary)] hover:underline"
              onClick={onResume}
            >
              Continuar execução
            </button>
          )}
          {onOpenJobWorkspace && runId && (
            <button
              type="button"
              className="mt-2 ml-3 font-mono text-[10px] text-[var(--forge-primary)] hover:underline"
              onClick={() => onOpenJobWorkspace(runId)}
            >
              Ver detalhes no inspector
            </button>
          )}
        </section>
      )}

      {/* Estado vazio */}
      {effectiveProgress?.finished &&
        !closingText &&
        !effectiveProgress.error &&
        !planForRun &&
        !rejectedPlan &&
        !showJobBubble && (
          <p
            className="forge-chat-live-line text-[var(--forge-muted)]"
            data-testid="assistant-turn-empty"
          >
            Resposta não gerada neste turno. Envie outra mensagem ou use Continuar no chat.
          </p>
        )}

      {/* Plano rejeitado (histórico) */}
      {rejectedPlan && !planForRun && (
        <section
          className="my-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/60 overflow-hidden"
          aria-label="Plano rejeitado"
          data-testid="plan-rejected-history"
        >
          <header className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]">
            <span className="text-xs font-medium text-[var(--foreground)]">Plano rejeitado</span>
          </header>
          <div className="max-h-[360px] overflow-hidden">
            <p className="p-4 text-sm text-[var(--forge-silver)]">{rejectedPlan.mission ?? rejectedPlan.summary}</p>
          </div>
        </section>
      )}

      {/* Footer: Copiar / Desfazer */}
      {canShowFooter && (onCopy || onUndo) ? (
        <footer className="forge-chat-item-assistant-footer mt-2 flex items-center justify-end gap-1 opacity-60 hover:opacity-100 transition-opacity">
          {onUndo && message && (
            <button
              type="button"
              onClick={() => onUndo(message.id)}
              className="p-1.5 rounded hover:bg-[var(--forge-surface-2)] transition-colors text-[var(--forge-muted)] hover:text-[var(--forge-destructive)]"
              aria-label="Desfazer"
            >
              <RotateCcw className="size-4" />
            </button>
          )}
          {closingText && onCopy && (
            <button
              type="button"
              onClick={() => onCopy(closingText, msgId)}
              className="p-1.5 rounded hover:bg-[var(--forge-surface-2)] transition-colors text-[var(--forge-muted)] hover:text-[var(--forge-foreground)]"
              aria-label={isCopied ? "Copiado!" : "Copiar mensagem"}
            >
              <Copy className={isCopied ? "size-4 text-[var(--forge-primary)]" : "size-4"} />
            </button>
          )}
        </footer>
      ) : null}
    </article>
  );
}
