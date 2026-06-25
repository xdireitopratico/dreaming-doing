import { useCallback, useMemo } from "react";
import type { AgentComposerMode, ChatMessage } from "@/lib/chat-types";
import type { ClarifyAnswer, ClarifyChoice, ClarifyPrompt } from "@/lib/chat/types";
import { formatClarifyChoiceReply } from "@/lib/clarify-choices";
import type { StoredMessagePart } from "@/lib/chat-attachments";
import { useChat } from "@/hooks/useChat";
import { useChatScroll } from "@/hooks/useChatScroll";
import { shouldHoldUserMessageAnchor } from "@/lib/chat/user-message-anchor";
import { ChatThread } from "./ChatThread";
import { ChatPlanDock } from "./ChatPlanDock";
import { ChatClarifyDock } from "./ChatClarifyDock";
import { ChatComposer } from "./ChatComposer";
import { ChatQueueDock, type PendingQueueItem } from "./ChatQueueDock";
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
  onUpdateQueueText?: (id: string, text: string) => Promise<void>;
  onReorderQueueItem?: (id: string, sortOrder: number) => Promise<void>;
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
  onUpdateQueueText,
  onReorderQueueItem,
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

  const handleClarifySubmit = useCallback(
    (answers: ClarifyAnswer[]) => {
      notifyUserSend();
      const lines = answers.map((ans, idx) => {
        const reply =
          ans.text?.trim() ??
          (ans.choice ? formatClarifyChoiceReply(ans.choice) : "Pular");
        return `${idx + 1}. ${reply}`;
      });
      const text = `Respostas do clarify:\n${lines.join("\n")}`;
      onSend(text, composerMode);
    },
    [notifyUserSend, onSend, composerMode],
  );

  const handleClarifySkip = useCallback(
    () => {
      notifyUserSend();
      onSend("/skip", composerMode);
    },
    [notifyUserSend, onSend, composerMode],
  );

  /** Extract last clarify prompt from the thread (docked at composer level). */
  const activeClarify: ClarifyPrompt | null = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      const item = thread[i];
      if (item?.kind === "assistant" && item.clarify && !item.isActive) {
        return item.clarify;
      }
    }
    return null;
  }, [thread]);

  const clarifyCreating = running && agent.progress.phase === "clarify" && !activeClarify;

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

      <ChatClarifyDock
        data={activeClarify}
        creating={clarifyCreating}
        disabled={running}
        onSubmit={handleClarifySubmit}
        onSkip={handleClarifySkip}
      />

      {(agent.progress.pendingQueueCount ?? 0) > 0 && pendingQueueItems.length > 0 ? (
        <ChatQueueDock
          items={pendingQueueItems}
          pendingCount={agent.progress.pendingQueueCount ?? 0}
          queuePaused={queuePaused ?? false}
          onUpdateRepeat={async (id, repeat) => {
            if (onUpdateQueueRepeat) await onUpdateQueueRepeat(id, repeat);
          }}
          onUpdateText={async (id, text) => {
            if (onUpdateQueueText) await onUpdateQueueText(id, text);
          }}
          onReorder={async (id, sortOrder) => {
            if (onReorderQueueItem) await onReorderQueueItem(id, sortOrder);
          }}
          onToggleQueuePaused={async (paused) => {
            if (onToggleQueuePaused) await onToggleQueuePaused(paused);
          }}
          onRemove={async (id) => {
            if (onClearPendingItem) await onClearPendingItem(id);
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