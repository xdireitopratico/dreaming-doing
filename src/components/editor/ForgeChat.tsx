import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@forge/ui";
import type { AgentProgress, PendingPlan } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";

import { ForgeMessage } from "@/components/editor/ForgeMessage";
import { AssistantTurn } from "@/components/editor/AssistantTurn";
import { ErrorHintCard } from "@/components/editor/ErrorHintCard";
import {
  e2bErrorHint,
  inngestQueueHint,
  llmErrorHint,
  timeoutHint,
  zombieRunHint,
} from "@/lib/llm-error-hints";
import { buildChatThread, resolveAssistantProgress } from "@/lib/chat-thread";
import { buildAgentRunView, isRunEffectivelyActive, shouldShowJobCard } from "@/lib/forge-run";
import { isAgentJobMessage } from "@/lib/assistant-run-progress";
import { resolveJobPlanForRun, storedPlanFromMessage } from "@/lib/plan-message-meta";
import { parseQualifyChoices } from "@/lib/qualify-choices";
import type { RollbackRequest } from "@/components/editor/ForgeRollbackFlow";

export type ForgeChatProps = {
  messages: ChatMessage[];
  running: boolean;
  progress: AgentProgress;
  activeRunId?: string | null;
  pendingPlan?: PendingPlan | null;
  onResume?: () => void;
  onRollbackRequest?: (req: RollbackRequest) => void;
  onOpenInspector?: (runId: string, tab?: "details" | "timeline" | "changes" | "plan") => void;
  focusedRunId?: string | null;
  onQualifySelect?: (text: string) => void;
  activeRunStartedAtMs?: number | null;
};

export function ForgeChat({
  messages,
  running,
  progress,
  activeRunId,
  pendingPlan,
  onResume,
  onRollbackRequest,
  onOpenInspector,
  focusedRunId,
  onQualifySelect,
  activeRunStartedAtMs,
}: ForgeChatProps) {
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
      buildChatThread(messages, progress, {
        activeRunId,
        running,
        pendingTurnStartedAtMs: activeRunStartedAtMs,
      }),
    [messages, progress, activeRunId, running, activeRunStartedAtMs],
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
    !running &&
    progress.finished &&
    progress.error &&
    !progress.resumable &&
    !progress.autoResuming;

  return (
    <div className="forge-chat-stream" role="log" aria-live="polite" data-testid="forge-chat">
      {thread.map((item, idx) => {
        if (item.kind === "user") {
          return (
            <ForgeMessage
              key={`user-${item.message.id}`}
              role="user"
              message={item.message}
              running={running}
              onCopy={handleCopy}
              onRollbackRequest={onRollbackRequest}
              copiedIds={copiedIds}
            />
          );
        }

        let userPrompt: string | null = null;
        for (let j = idx - 1; j >= 0; j--) {
          const prev = thread[j];
          if (prev?.kind === "user") {
            userPrompt = prev.message.content?.trim() ?? null;
            break;
          }
        }

        const resolved = resolveAssistantProgress(item);
        const runId = item.runId ?? activeRunId ?? `slot-${idx}`;

        const anchoredLive =
          !!running &&
          !!activeRunId &&
          !!item.runId &&
          item.runId === activeRunId &&
          !!resolved &&
          !resolved.finished &&
          !resolved.canceled;

        const isQualifyOnly =
          !!resolved &&
          resolved.awaitingKind === "qualify" &&
          !!resolved.awaiting &&
          !anchoredLive &&
          (resolved.tools?.length ?? 0) === 0 &&
          (resolved.diffs?.length ?? 0) === 0 &&
          (resolved.deliveryFiles?.length ?? 0) === 0;

        const hasExecutionEvidence =
          !!resolved &&
          ((resolved.timeline?.length ?? 0) > 0 ||
            (resolved.tools?.length ?? 0) > 0 ||
            (resolved.diffs?.length ?? 0) > 0 ||
            (resolved.deliveryFiles?.length ?? 0) > 0 ||
            resolved.phase === "gather" ||
            resolved.phase === "classify" ||
            resolved.phase === "plan" ||
            resolved.phase === "execute" ||
            resolved.phase === "observe" ||
            resolved.phase === "summarize");

        const slotActive = resolved
          ? isRunEffectivelyActive(resolved, item.isActive || anchoredLive)
          : item.isActive || anchoredLive;

        const showJobCard = shouldShowJobCard({
          runId: item.runId,
          progress: resolved,
          isQualifyOnly,
          isAgentJobMessage: isAgentJobMessage(item.message),
          hasExecutionEvidence,
          slotActive,
          activeRunId,
        });

        const jobPlan = item.runId
          ? resolveJobPlanForRun(item.runId, messages, {
              livePlan: pendingPlan && pendingPlan.runId === item.runId ? pendingPlan : null,
              progressPlan: resolved?.pendingPlan ?? null,
              assistantMessage: item.message,
            })
          : null;

        const runStartedAtMs = item.runId === activeRunId ? (activeRunStartedAtMs ?? null) : null;

        const msgPlanMeta = item.message ? storedPlanFromMessage(item.message) : null;
        const planStatus = msgPlanMeta?.status ?? null;
        const planForPrompt = jobPlan ?? msgPlanMeta?.plan ?? null;
        const planAwaitingApproval =
          progress.awaitingKind === "plan_approval" || resolved?.awaitingKind === "plan_approval";
        const planRunMatches =
          (!!pendingPlan?.runId && pendingPlan.runId === item.runId) ||
          msgPlanMeta?.plan.runId === item.runId;
        const planAlreadyDecided = planStatus === "approved" || planStatus === "rejected";
        const planTeaser =
          !!onOpenInspector &&
          !!planForPrompt?.steps?.length &&
          planRunMatches &&
          !planAlreadyDecided &&
          (msgPlanMeta?.status === "pending" || planAwaitingApproval);

        const runView = resolved
          ? buildAgentRunView(runId, resolved, {
              running: slotActive,
              jobPlan,
              userPrompt,
              runStartedAtMs,
              forcePlanReady: planTeaser,
            })
          : null;

        const stableKey = item.runId
          ? `assistant-${item.runId}`
          : item.message?.id
            ? `msg-${item.message.id}`
            : `slot-${idx}`;

        const isLastTurn =
          idx === thread.length - 1 || !thread.slice(idx + 1).some((t) => t.kind === "assistant");
        const closingText = runView?.closingText ?? item.message?.content?.trim() ?? null;
        const parsedQualify = closingText ? parseQualifyChoices(closingText) : null;
        const qualifyInteractive =
          !!onQualifySelect &&
          isLastTurn &&
          !running &&
          !slotActive &&
          !!parsedQualify &&
          (progress.awaitingKind === "qualify" ||
            progress.awaiting ||
            resolved?.awaitingKind === "qualify");

        return (
          <AssistantTurn
            key={stableKey}
            message={item.message}
            runView={runView}
            progress={resolved}
            isActive={slotActive}
            isFocused={!!item.runId && focusedRunId === item.runId}
            showJobCard={showJobCard || planTeaser}
            qualifyInteractive={qualifyInteractive}
            planTeaser={planTeaser}
            jobPlan={planForPrompt}
            onQualifySelect={onQualifySelect}
            running={running}
            onCopy={handleCopy}
            onRollbackRequest={onRollbackRequest}
            copiedIds={copiedIds}
            onResume={onResume}
            onOpenInspector={onOpenInspector}
          />
        );
      })}

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
            <AlertTriangle
              className="size-4 shrink-0"
              style={{ color: "var(--status-thinking)" }}
            />
            <p className="flex-1 min-w-0" style={{ font: "var(--font-thought)", fontSize: "10px" }}>
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
