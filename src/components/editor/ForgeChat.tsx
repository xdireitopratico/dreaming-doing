import { useCallback, useMemo, useState } from "react";
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
import { buildAssistantTurnModel } from "@/lib/forge-chat/turn-model";
import type { ForgeChatThreadItem } from "@/lib/forge-chat/types";
import type { RollbackRequest } from "@/components/editor/ForgeRollbackFlow";

export type ForgeChatProps = {
  thread: ForgeChatThreadItem[];
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
  thread,
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

  const turnCtxBase = useMemo(
    () => ({
      messages,
      thread,
      running,
      activeRunId,
      activeRunStartedAtMs,
      pendingPlan,
      sessionProgress: progress,
      onOpenInspector: !!onOpenInspector,
      onQualifySelect: !!onQualifySelect,
    }),
    [
      messages,
      thread,
      running,
      activeRunId,
      activeRunStartedAtMs,
      pendingPlan,
      progress,
      onOpenInspector,
      onQualifySelect,
    ],
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

        const model = buildAssistantTurnModel(
          item,
          { ...turnCtxBase, itemIndex: idx },
          focusedRunId,
        );

        return (
          <AssistantTurn
            key={model.stableKey}
            message={model.message}
            runView={model.runView}
            progress={model.progress}
            isActive={model.isActive}
            isFocused={model.isFocused}
            showJobCard={model.showJobCard}
            qualifyInteractive={model.qualifyInteractive}
            planTeaser={model.planTeaser}
            jobPlan={model.jobPlan}
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