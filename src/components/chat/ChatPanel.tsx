import { useCallback, useMemo } from "react";
import type { AgentComposerMode, ChatMessage } from "@/lib/chat-types";
import { formatClarifyChoiceReply } from "@/lib/clarify-choices";
import type { ClarifyChoice } from "@/lib/chat/types";
import type { StoredMessagePart } from "@/lib/chat-attachments";
import { useChat } from "@/hooks/useChat";
import { useChatScroll } from "@/hooks/useChatScroll";
import { shouldHoldUserMessageAnchor } from "@/lib/chat/user-message-anchor";
import { ChatThread } from "./ChatThread";
import { ChatPlanDock } from "./ChatPlanDock";
import { ChatComposer } from "./ChatComposer";
import { PendingQueuePanel, type PendingQueueItem } from "@/components/editor/PendingQueuePanel";
import type { PlanStep } from "@/lib/agent-progress";
import type { useAgentRun } from "@/hooks/useAgentRun";

type AgentRun = ReturnType<typeof useAgentRun>;

export type ChatPanelProps = {
  projectId: string;
  conversationId: string | null | undefined;
  messages: ChatMessage[];
  messagesLoading?: boolean;
  agentHasRun?: boolean;
  agent: AgentRun;
  running: boolean;
  composerMode?: AgentComposerMode;
  onComposerModeChange?: (mode: AgentComposerMode) => void;
  onSend: (text: string, mode?: AgentComposerMode, parts?: StoredMessagePart[]) => void;
  onStop: () => void;
  onResume?: () => void;
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
  onPlanApprove?: (steps: PlanStep[], markdown?: string) => void | Promise<void>;
  onPlanReject?: (reason?: string) => void | Promise<void>;
  onRollbackMessage?: (
    messageId: string,
    role: "user" | "assistant",
  ) => Promise<{ ok: boolean; error?: string }>;
  focusedRunId?: string | null;
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
  pendingQueueItems?: PendingQueueItem[];
  queueBlockingReason?: string | null;
  queuePaused?: boolean;
  onUpdateQueueRepeat?: (id: string, repeat: number) => Promise<void>;
  onToggleQueueItemPaused?: (id: string, paused: boolean) => Promise<void>;
  onToggleQueuePaused?: (paused: boolean) => Promise<void>;
  onClearPendingItem?: (id: string) => Promise<void>;
  onClearAllPending?: () => Promise<void>;
  onDrainQueue?: () => Promise<void>;
  onVisualEdits?: () => void;
  visualEditsActive?: boolean;
};

export function ChatPanel({
  projectId,
  conversationId,
  messages,
  messagesLoading = false,
  agentHasRun = false,
  agent,
  running,
  composerMode = "plan",
  onComposerModeChange,
  onSend,
  onStop,
  onResume,
  onOpenInspector,
  onPlanApprove,
  onPlanReject,
  onRollbackMessage,
  focusedRunId,
  externalPrompt,
  onExternalPromptConsumed,
  pendingQueueItems = [],
  queueBlockingReason,
  queuePaused,
  onUpdateQueueRepeat,
  onToggleQueueItemPaused,
  onToggleQueuePaused,
  onClearPendingItem,
  onClearAllPending,
  onDrainQueue,
  onVisualEdits,
  visualEditsActive,
}: ChatPanelProps) {
  const {
    thread,
    pendingPlan,
    messagesLoading: chatLoading,
    agentBusy,
    busyReason,
    takeOver,
  } = useChat({
    projectId,
    conversationId,
    messages,
    messagesLoading,
    agentHasRun,
    agent,
    running,
    focusedRunId,
  });

  const holdUserAnchor = shouldHoldUserMessageAnchor({
    isPendingRun: agent.isPendingRun,
    running,
    activeRunId: agent.activeRunId,
    finished: agent.progress.finished,
  });

  const lastUserMessageId = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      const item = thread[i];
      if (item?.kind === "user") return item.message.id;
    }
    return null;
  }, [thread]);

  const { scrollRef, handleScroll, notifyUserSend, showPill, followToBottom } = useChatScroll({
    conversationId,
    chatLoading,
    thread,
    lastUserMessageId,
    holdUserAnchor,
  });

  const handleSend = useCallback(
    (text: string, mode?: AgentComposerMode, parts?: StoredMessagePart[]) => {
      notifyUserSend();
      onSend(text, mode ?? composerMode, parts);
    },
    [notifyUserSend, onSend, composerMode],
  );

  const handleClarifySelect = useCallback(
    (choice: ClarifyChoice) => {
      notifyUserSend();
      onSend(formatClarifyChoiceReply(choice), composerMode);
    },
    [notifyUserSend, onSend, composerMode],
  );

  const lastAssistantMessageId = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      const item = thread[i];
      if (item?.kind !== "assistant" || !item.message?.id) continue;
      if (!item.isActive) return item.message.id;
    }
    return null;
  }, [thread]);

  const handleRollback = useCallback(
    async (messageId: string, role: "user" | "assistant") => {
      if (!onRollbackMessage) return;
      await onRollbackMessage(messageId, role);
    },
    [onRollbackMessage],
  );

  const chatHydrating = chatLoading;

  return (
    <div className="forge-chat-inner">
      <div ref={scrollRef} className="forge-messages" onScroll={handleScroll} tabIndex={0}>
        {!chatHydrating && (
          <ChatThread
            items={thread}
            onOpenInspector={onOpenInspector}
            onClarifySelect={handleClarifySelect}
            onRollback={onRollbackMessage ? handleRollback : undefined}
            onResume={onResume}
            lastUserMessageId={lastUserMessageId}
            lastAssistantMessageId={lastAssistantMessageId}
          />
        )}

        {showPill && (
          <button
            type="button"
            className="forge-new-messages-pill"
            onClick={followToBottom}
          >
            Novas mensagens
          </button>
        )}
      </div>

      <ChatPlanDock
        pendingPlan={pendingPlan}
        creating={running && agent.progress.phase === "creating_plan" && !pendingPlan}
        onReview={(runId) => onOpenInspector?.(runId, "plan")}
        onApprove={onPlanApprove}
        onReject={onPlanReject}
      />

      {((agent.progress.pendingQueueCount ?? 0) > 0 && pendingQueueItems.length > 0) ||
      (queueBlockingReason && running) ? (
        <PendingQueuePanel
          items={pendingQueueItems}
          pendingCount={agent.progress.pendingQueueCount ?? 0}
          running={running}
          blockingReason={queueBlockingReason}
          onCopy={(text) => void navigator.clipboard.writeText(text)}
          onRemove={async (id) => {
            if (onClearPendingItem) await onClearPendingItem(id);
          }}
          onClearAll={async () => {
            if (onClearAllPending) await onClearAllPending();
          }}
          onDrain={async () => {
            if (onDrainQueue) await onDrainQueue();
          }}
        />
      ) : null}

      <ChatComposer
        running={running}
        agentBusy={agentBusy}
        busyReason={busyReason}
        onTakeOver={takeOver}
        planPending={!!pendingPlan}
        queuePaused={queuePaused}
        composerMode={composerMode}
        onComposerModeChange={onComposerModeChange}
        onSend={handleSend}
        onStop={onStop}
        onVisualEdits={onVisualEdits}
        visualEditsActive={visualEditsActive}
        externalPrompt={externalPrompt}
        onExternalPromptConsumed={onExternalPromptConsumed}
      />
    </div>
  );
}