import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@forge/ui";
import type { AgentProgress, PendingPlan } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import type { PendingQueueItem } from "@/components/editor/PendingQueuePanel";
import { ForgeMessage } from "@/components/editor/ForgeMessage";
import { ErrorHintCard } from "@/components/editor/ErrorHintCard";
import {
  e2bErrorHint,
  inngestQueueHint,
  llmErrorHint,
  timeoutHint,
  zombieRunHint,
} from "@/lib/llm-error-hints";
import {
  buildLovableThread,
  type FrozenRunSnapshot,
  resolveAssistantProgress,
} from "@/lib/lovable-thread";
import { buildAgentRunView } from "@/lib/forge-run";
import { isAgentJobMessage } from "@/lib/assistant-run-progress";

export type ForgeChatProps = {
  messages: ChatMessage[];
  running: boolean;
  progress: AgentProgress;
  activeRunId?: string | null;
  frozenRuns?: ReadonlyMap<string, FrozenRunSnapshot>;
  pendingQueueItems?: PendingQueueItem[];
  pendingPlan?: PendingPlan | null;
  onResume?: () => void;
  onUndoMessage?: (assistantMsgId: string) => void;
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
  focusedRunId?: string | null;
};

export function ForgeChat({
  messages,
  running,
  progress,
  activeRunId,
  frozenRuns,
  pendingQueueItems = [],
  pendingPlan,
  onResume,
  onUndoMessage,
  onOpenInspector,
  focusedRunId,
}: ForgeChatProps) {
  const awaitingQualify = progress.awaitingKind === "qualify" && !pendingPlan;
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());

  const handleCopy = useCallback((text: string, msgId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIds((prev) => new Set(prev).add(msgId));
      setTimeout(() => {
        setCopiedIds((prev) => {
          const n = new Set(prev);
          n.delete(msgId);
          return n;
        });
      }, 2000);
    });
  }, []);

  const thread = useMemo(
    () =>
      buildLovableThread(messages, progress, {
        activeRunId,
        running,
        frozenRuns,
      }),
    [messages, progress, activeRunId, running, frozenRuns],
  );

  const resolveErrorHint = useCallback((error: string) => {
    const lower = error.toLowerCase();
    if (/zumbi|expirado/i.test(error)) return zombieRunHint();
    if (/inngest|continue_queue|inngest_failed/i.test(lower)) return inngestQueueHint();
    if (/edge.*timeout|120s|edge function.*limite/i.test(error)) return timeoutHint();
    if (/e2b|sandbox/i.test(lower)) return e2bErrorHint(error);
    return llmErrorHint(error, false);
  }, []);

  const showGlobalError =
    !running && progress.finished && progress.error && !progress.resumable && !progress.autoResuming;

  return (
    <div className="forge-chat-stream" role="log" aria-live="polite" data-testid="forge-chat">
      {awaitingQualify && (
        <section
          className="my-2 rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-2)]/40 px-3 py-2.5 flex items-start gap-2"
          data-testid="awaiting-user-banner"
        >
          <MessageCircle className="size-4 shrink-0 text-[var(--forge-primary)] mt-0.5" />
          <p className="text-sm text-[var(--forge-foreground)] leading-relaxed">
            Uma pergunta rápida antes de continuar — responda no campo abaixo.
          </p>
        </section>
      )}

      {thread.map((item, idx) => {
        if (item.kind === "user") {
          return <ForgeMessage key={`user-${item.message.id}`} role="user" message={item.message} />;
        }

        const resolved = resolveAssistantProgress(item);
        const runId = item.runId ?? activeRunId ?? `slot-${idx}`;
        const isBuildRun =
          !!item.runId || isAgentJobMessage(item.message) || (resolved?.timeline?.length ?? 0) > 0;
        const showJobCard =
          isBuildRun &&
          !!resolved &&
          (!!item.runId ||
            item.isActive ||
            (resolved.timeline?.length ?? 0) > 0 ||
            (resolved.tools?.length ?? 0) > 0);

        const planForRun =
          pendingPlan && (!item.runId || pendingPlan.runId === item.runId) ? pendingPlan : null;

        const runView =
          resolved && showJobCard
            ? buildAgentRunView(runId, resolved, {
                running: item.isActive,
                pendingPlan: planForRun,
              })
            : null;

        const stableKey = item.message?.id
          ? `assistant-${item.message.id}`
          : item.runId
            ? `live-${item.runId}`
            : `slot-${idx}`;

        return (
          <ForgeMessage
            key={stableKey}
            role="assistant"
            message={item.message}
            runView={runView}
            isActive={item.isActive}
            isFocused={!!item.runId && focusedRunId === item.runId}
            showJobCard={showJobCard}
            onCopy={handleCopy}
            onUndo={onUndoMessage}
            copiedIds={copiedIds}
            onResume={onResume}
            onOpenInspector={onOpenInspector}
          />
        );
      })}

      {pendingQueueItems.length > 0 && (
        <div className="space-y-2" data-testid="pending-queue-messages">
          {pendingQueueItems.map((item) => (
            <article key={`pending-${item.id}`} className="forge-chat-item forge-chat-item-user opacity-60">
              <div className="forge-msg-user-outline border-dashed bg-[var(--forge-surface-2)]">
                <p className="whitespace-pre-wrap text-[var(--forge-muted)]">{item.preview}</p>
                <span className="text-[10px] text-[var(--forge-ghost)] mt-1 block">Na fila…</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {showGlobalError && (
        <section data-testid="agent-global-error">
          <ErrorHintCard hint={resolveErrorHint(progress.error!)} />
        </section>
      )}

      {!running && progress.resumable && !progress.autoResuming && (
        <div className="space-y-2">
          {progress.error && (
            <ErrorHintCard hint={resolveErrorHint(progress.error)} onAction={onResume} />
          )}
          <section className="forge-chat-resume">
            <AlertTriangle className="size-4 text-amber-400 shrink-0" />
            <p className="flex-1 min-w-0 font-mono text-[10px] text-[var(--forge-silver)] leading-relaxed">
              Execução pausada — use Continuar para retomar.
            </p>
            {onResume && (
              <Button type="button" size="sm" variant="primary" onClick={onResume}>
                <RefreshCw className="size-3.5 mr-1" />
                Continuar
              </Button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}