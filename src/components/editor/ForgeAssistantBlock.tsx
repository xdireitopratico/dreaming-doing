import { Copy, RotateCcw, Zap } from "lucide-react";
import type { ChatMessage } from "@/components/editor/ChatInput";
import type { AgentProgress, PendingPlan, PlanStep } from "@/lib/agent-progress";
import { ChatDiffViewer } from "@/components/editor/ChatDiffViewer";
import { PlanViewer } from "@/components/editor/PlanViewer";
import { PlanDocumentView } from "@/components/editor/PlanDocumentView";
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
  showMiniJob?: boolean,
): string | null {
  if (showMiniJob && progress) {
    const fromStream = progress.streamText?.trim();
    if (fromStream) return fromStream;
    const fromSummary = progress.summary?.trim();
    if (fromSummary) return fromSummary;
  }
  return message?.content?.trim() || null;
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
  const livePlan =
    pendingPlan && (!runId || pendingPlan.runId === runId) ? pendingPlan : null;
  const planForRun =
    livePlan ?? (storedPlan?.status === "pending" ? storedPlan.plan : null);
  const rejectedPlan = storedPlan?.status === "rejected" ? storedPlan.plan : null;
  const diffs = effectiveProgress?.diffs ?? [];

  const isAgentJobTurn = !!runId || isAgentJobMessage(message);
  const showMiniJob = isAgentJobTurn && !!effectiveProgress;

  const closingText = resolveClosingText(effectiveProgress, message, showMiniJob);

  const showDoneFooter =
    !!effectiveProgress?.finished &&
    !isActive &&
    showMiniJob &&
    effectiveProgress.lastFinishOk === true &&
    !effectiveProgress.canceled &&
    !!closingText;

  const isPersistedMessage =
    !!message?.id && !String(message.id).startsWith("live-");
  const canShowFooter =
    !!effectiveProgress?.finished &&
    !isActive &&
    isPersistedMessage &&
    !!closingText;

  const turnTimestamp = message?.timestamp;

  return (
    <article className="forge-chat-item forge-chat-item-assistant relative group">
      <div className="flex items-start justify-between gap-2">
        <span className="forge-chat-sender forge-chat-sender-assistant shrink-0">FORGE</span>
        {showTokens && estimatedTokens > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[10px] font-mono text-[var(--forge-primary)]">
            <Zap className="size-3" />
            <span>~{estimatedTokens.toLocaleString()} tokens</span>
          </div>
        )}
      </div>

      {effectiveProgress && showMiniJob && (
        <AgentJobMiniCard
          progress={effectiveProgress}
          runId={runId}
          isActive={isActive}
          isFocused={!!runId && jobWorkspaceRunId === runId}
          onOpen={onOpenJobWorkspace}
        />
      )}

      {closingText ? (
        <p
          className="forge-chat-live-line forge-chat-closing-text text-[var(--forge-silver)] text-[13px] leading-relaxed whitespace-pre-wrap"
          data-testid="assistant-closing-text"
        >
          {closingText}
        </p>
      ) : null}

      {showDoneFooter && (
        <p className="lovable-job-done-footer" data-testid="assistant-done-footer">
          Done
        </p>
      )}

      {turnTimestamp && effectiveProgress?.finished && !isActive && (
        <time
          className="lovable-turn-timestamp"
          dateTime={new Date(turnTimestamp).toISOString()}
        >
          {new Date(turnTimestamp).toLocaleString("pt-BR", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      )}

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

      {effectiveProgress?.finished &&
        !closingText &&
        !effectiveProgress.error &&
        !planForRun &&
        !rejectedPlan &&
        !showMiniJob && (
        <p
          className="forge-chat-live-line text-[var(--forge-muted)]"
          data-testid="assistant-turn-empty"
        >
          Resposta não gerada neste turno. Envie outra mensagem ou use Continuar no chat.
        </p>
      )}

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
            <PlanDocumentView plan={rejectedPlan} editable={false} />
          </div>
        </section>
      )}

      {planForRun && onReopenPlan && onPlanApprove && onPlanReject && (
        <div className="forge-plan-panel my-3 w-full max-w-full min-w-0" data-testid="plan-panel">
          <PlanViewer
            plan={planForRun}
            onOpen={onReopenPlan}
            onApprove={onPlanApprove}
            onReject={onPlanReject}
          />
        </div>
      )}

      {!isActive && diffs.length > 0 && <ChatDiffViewer diffs={diffs} />}

      {canShowFooter && (onCopy || onUndo) ? (
        <footer className="forge-chat-item-assistant-footer mt-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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