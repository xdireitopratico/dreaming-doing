import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  RotateCcw,
  Zap,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ChatMessage } from "@/components/editor/ChatInput";
import { initialAgentProgress, type AgentProgress, type PendingPlan, type PlanStep } from "@/lib/agent-progress";
import { buildAgentNarrative } from "@/lib/agent-narrative";
import { AgentTimeline } from "@/components/editor/AgentTimeline";
import { ChatDiffViewer } from "@/components/editor/ChatDiffViewer";
import { PlanViewer } from "@/components/editor/PlanViewer";
import { PlanDocumentView } from "@/components/editor/PlanDocumentView";
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
}: ForgeAssistantBlockProps) {
  const [detailsOpen, setDetailsOpen] = useState(isActive);
  const msgId = message?.id ?? `live-${runId ?? "forge"}`;
  const isCopied = copiedIds?.has(msgId) ?? false;

  useEffect(() => {
    setDetailsOpen(isActive);
  }, [isActive]);

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

  const displayText = narrative.body ?? message?.content ?? null;

  return (
    <article className="forge-chat-item forge-chat-item-assistant relative group">
      <div className="flex items-start justify-between gap-2">
        <span className="forge-chat-sender forge-chat-sender-assistant shrink-0">FORGE</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {showTokens && estimatedTokens > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[10px] font-mono text-[var(--forge-primary)]">
              <Zap className="size-3" />
              <span>~{estimatedTokens.toLocaleString()} tokens</span>
            </div>
          )}
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
        </div>
      </div>

      {/* Camada de comunicação — sempre visível durante run */}
      {isActive && narrative.headline && (
        <div
          className="flex items-center gap-2 mt-1 mb-2 min-w-0"
          data-testid="agent-narrative-headline"
        >
          <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--forge-primary)]" />
          <p className="font-mono text-[11px] text-[var(--forge-silver)] leading-snug truncate">
            {narrative.headline}
          </p>
        </div>
      )}

      {isActive && narrative.subhint && (
        <p className="forge-chat-live-hint mb-2">{narrative.subhint}</p>
      )}

      {isActive && narrative.showTyping && !displayText && (
        <p className="forge-chat-live-line flex items-center gap-1.5" aria-live="polite">
          <span className="inline-flex gap-0.5">
            <span className="size-1 rounded-full bg-[var(--forge-primary)] animate-pulse" />
            <span className="size-1 rounded-full bg-[var(--forge-primary)] animate-pulse [animation-delay:120ms]" />
            <span className="size-1 rounded-full bg-[var(--forge-primary)] animate-pulse [animation-delay:240ms]" />
          </span>
          Preparando resposta…
        </p>
      )}

      {displayText ? (
        <MarkdownRenderer className="forge-chat-markdown">{displayText}</MarkdownRenderer>
      ) : null}

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

      {hasDetails && effectiveProgress && (
        <Collapsible
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          className="mt-3 rounded-lg border border-[var(--forge-border)] bg-[var(--forge-bg)]/30"
        >
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-[var(--forge-ghost)] hover:text-[var(--forge-muted)]">
            {detailsOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            Detalhes da execução
            {!isActive && (
              <span className="ml-auto normal-case tracking-normal text-[var(--forge-ghost)]">
                {effectiveProgress.tools.filter((t) => t.ok === true).length} tools
              </span>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="px-2 pb-2">
            {effectiveProgress && effectiveProgress.timeline.length > 0 ? (
              <AgentTimeline timeline={effectiveProgress.timeline} running={isActive} />
            ) : executionLog.length > 0 ? (
              <ul className="space-y-1 font-mono text-[10px] text-[var(--forge-muted)]">
                {executionLog.slice(-12).map((line, i) => (
                  <li key={`${line.slice(0, 24)}-${i}`} className="truncate">
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      )}

      {planForRun && onReopenPlan && onPlanApprove && onPlanReject && (
        <div className="my-3 inline-block max-w-fit" data-testid="plan-panel">
          <PlanViewer
            plan={planForRun}
            onOpen={onReopenPlan}
            onApprove={onPlanApprove}
            onReject={onPlanReject}
          />
        </div>
      )}

      {diffs.length > 0 && <ChatDiffViewer diffs={diffs} />}
    </article>
  );
}