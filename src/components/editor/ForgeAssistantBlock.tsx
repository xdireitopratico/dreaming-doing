import { Copy, RotateCcw, Zap } from "lucide-react";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { ChatMessage } from "@/components/editor/ChatInput";
import { initialAgentProgress, type AgentProgress, type PendingPlan, type PlanStep } from "@/lib/agent-progress";
import { buildAgentNarrative } from "@/lib/agent-narrative";
import { ChatDiffViewer } from "@/components/editor/ChatDiffViewer";
import { PlanViewer } from "@/components/editor/PlanViewer";
import { PlanDocumentView } from "@/components/editor/PlanDocumentView";
import { AgentJobMiniCard } from "@/components/editor/AgentJobMiniCard";
import { AgentActivityCard } from "@/components/editor/AgentActivityCard";
import { AgentStepBar } from "@/components/editor/AgentStepBar";
import { TurnReceipt } from "@/components/editor/TurnReceipt";
import { storedPlanFromMessage } from "@/lib/plan-message-meta";

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

  const narrative = buildAgentNarrative(progress ?? initialAgentProgress, {
    running: isActive,
    persistedText: message?.content,
  });

  const effectiveProgress = progress;
  const storedPlan = storedPlanFromMessage(message);
  const livePlan =
    pendingPlan && (!runId || pendingPlan.runId === runId) ? pendingPlan : null;
  const planForRun =
    livePlan ??
    (storedPlan?.status === "pending" ? storedPlan.plan : null);
  const rejectedPlan = storedPlan?.status === "rejected" ? storedPlan.plan : null;
  const diffs = effectiveProgress?.diffs ?? [];
  const executionLog = Array.isArray(message?.meta?.executionLog)
    ? (message!.meta!.executionLog as string[])
    : [];
  const hasDetails =
    (effectiveProgress?.timeline.length ?? 0) > 0 ||
    (effectiveProgress?.tools.length ?? 0) > 0 ||
    executionLog.length > 0;

  const showMiniJob =
    effectiveProgress &&
    (isActive ||
      (effectiveProgress.timeline.length > 0 || effectiveProgress.tools.length > 0) ||
      !effectiveProgress.finished);

  const displayText =
    isActive && effectiveProgress?.autoResuming
      ? null
      : isActive && showMiniJob
        ? null
        : narrative.body ?? message?.content ?? null;

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

      {isActive &&
        effectiveProgress?.currentStep != null &&
        effectiveProgress?.totalSteps != null &&
        effectiveProgress.totalSteps > 0 && (
          <AgentStepBar
            current={effectiveProgress.currentStep}
            total={effectiveProgress.totalSteps}
            active={isActive}
          />
        )}

      {displayText ? (
        <MarkdownRenderer className="forge-chat-markdown">{displayText}</MarkdownRenderer>
      ) : isActive && narrative.showTyping ? (
        <p className="forge-chat-live-line flex items-center gap-1.5" aria-live="polite">
          <span className="inline-flex gap-0.5">
            <span className="size-1 rounded-full bg-[var(--forge-primary)] animate-pulse" />
            <span className="size-1 rounded-full bg-[var(--forge-primary)] animate-pulse [animation-delay:120ms]" />
            <span className="size-1 rounded-full bg-[var(--forge-primary)] animate-pulse [animation-delay:240ms]" />
          </span>
          Preparando resposta…
        </p>
      ) : null}

      {effectiveProgress && showMiniJob && (
        <AgentJobMiniCard
          progress={effectiveProgress}
          runId={runId}
          isActive={isActive}
          isFocused={!!runId && jobWorkspaceRunId === runId}
          onOpen={onOpenJobWorkspace}
        />
      )}

      {effectiveProgress && !showMiniJob && (
        <AgentActivityCard
          progress={effectiveProgress}
          isActive={isActive}
          persistedText={message?.content ?? effectiveProgress.streamText}
        />
      )}

      {effectiveProgress && !isActive && effectiveProgress.finished && (
        <TurnReceipt
          progress={effectiveProgress}
          runId={runId}
          onResume={effectiveProgress.resumable ? onResume : undefined}
        />
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
        </section>
      )}

      {effectiveProgress?.finished &&
        !displayText &&
        !effectiveProgress.error &&
        !planForRun &&
        !rejectedPlan && (
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

      {!isActive && hasDetails && effectiveProgress && onOpenJobWorkspace && runId && (
        <button
          type="button"
          className="mt-2 font-mono text-[10px] text-[var(--forge-primary)] hover:underline"
          onClick={() => onOpenJobWorkspace(runId)}
        >
          Ver timeline no preview →
        </button>
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

      {(displayText && onCopy) || (message && onUndo) ? (
        <footer className="forge-chat-item-assistant-footer mt-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {displayText && onCopy && (
            <button
              type="button"
              onClick={() => onCopy(displayText, msgId)}
              className="p-1.5 rounded hover:bg-[var(--forge-surface-2)] transition-colors text-[var(--forge-muted)] hover:text-[var(--forge-foreground)]"
              aria-label={isCopied ? "Copiado!" : "Copiar mensagem"}
            >
              <Copy className={isCopied ? "size-4 text-[var(--forge-primary)]" : "size-4"} />
            </button>
          )}
          {message && onUndo && (
            <button
              type="button"
              onClick={() => onUndo(message.id)}
              className="p-1.5 rounded hover:bg-[var(--forge-surface-2)] transition-colors text-[var(--forge-muted)] hover:text-[var(--forge-destructive)]"
              aria-label="Desfazer"
            >
              <RotateCcw className="size-4" />
            </button>
          )}
        </footer>
      ) : null}
    </article>
  );
}