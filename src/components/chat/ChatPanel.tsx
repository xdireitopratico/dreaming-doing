import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AgentComposerMode, ChatMessage } from "@/lib/chat-types";
import { formatClarifyChoiceReply } from "@/lib/clarify-choices";
import type { ClarifyChoice } from "@/lib/chat/types";
import type { StoredMessagePart } from "@/lib/chat-attachments";
import { useChat } from "@/hooks/useChat";
import {
  scrollOffsetToAlignUserMessage,
  shouldAnchorNewUserMessage,
  shouldHoldUserMessageAnchor,
  type ChatScrollMode,
} from "@/lib/chat/user-message-anchor";
import { ChatThread } from "./ChatThread";
import { ChatPlanDock } from "./ChatPlanDock";
import { ChatComposer } from "./ChatComposer";
import { ChatEmptyState } from "./ChatEmptyState";
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
    showEmptyState,
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const scrollModeRef = useRef<ChatScrollMode>("bottom");
  const anchoredUserIdRef = useRef<string | null>(null);
  const prevLastUserMessageIdRef = useRef<string | null>(null);
  const initialScrollDoneRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const userScrolledAwayRef = useRef(false);
  const userJustSentRef = useRef(false);
  const [showPill, setShowPill] = useState(false);
  const [suggestionPrompt, setSuggestionPrompt] = useState<string | null>(null);
  const PIN_THRESHOLD_PX = 100;

  const holdUserAnchor = shouldHoldUserMessageAnchor({
    isPendingRun: agent.isPendingRun,
    running,
    activeRunId: agent.activeRunId,
    finished: agent.progress.finished,
  });

  const runProgrammaticScroll = useCallback((fn: () => void) => {
    isProgrammaticScrollRef.current = true;
    fn();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    });
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const el = scrollRef.current;
      if (!el) return;
      runProgrammaticScroll(() => {
        el.scrollTo({ top: el.scrollHeight, behavior });
        pinnedToBottom.current = true;
        scrollModeRef.current = "bottom";
        anchoredUserIdRef.current = null;
        userScrolledAwayRef.current = false;
        setShowPill(false);
      });
    },
    [runProgrammaticScroll],
  );

  const anchorUserBubble = useCallback(
    (messageId: string, behavior: ScrollBehavior = "auto"): boolean => {
      const container = scrollRef.current;
      if (!container) return false;
      const bubble = container.querySelector<HTMLElement>(`[data-user-msg-id="${messageId}"]`);
      if (!bubble) return false;
      runProgrammaticScroll(() => {
        bubble.scrollIntoView({ block: "start", behavior });
        pinnedToBottom.current = false;
        scrollModeRef.current = "user-anchor";
        anchoredUserIdRef.current = messageId;
        userScrolledAwayRef.current = false;
        setShowPill(false);
      });
      return true;
    },
    [runProgrammaticScroll],
  );

  const handleScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottom.current = dist <= PIN_THRESHOLD_PX;

    const messageId = anchoredUserIdRef.current;
    if (
      holdUserAnchor &&
      scrollModeRef.current === "user-anchor" &&
      messageId &&
      !userScrolledAwayRef.current
    ) {
      const bubble = el.querySelector<HTMLElement>(`[data-user-msg-id="${messageId}"]`);
      if (bubble) {
        const anchorTop = scrollOffsetToAlignUserMessage(el, bubble);
        if (Math.abs(el.scrollTop - anchorTop) > 48) {
          userScrolledAwayRef.current = true;
        }
      }
    }

    if (pinnedToBottom.current && !holdUserAnchor) {
      scrollModeRef.current = "bottom";
      anchoredUserIdRef.current = null;
      userScrolledAwayRef.current = false;
      setShowPill(false);
    }
  }, [holdUserAnchor]);

  const lastUserMessageId = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      const item = thread[i];
      if (item?.kind === "user") return item.message.id;
    }
    return null;
  }, [thread]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    prevLastUserMessageIdRef.current = null;
    scrollModeRef.current = "bottom";
    anchoredUserIdRef.current = null;
    userScrolledAwayRef.current = false;
    userJustSentRef.current = false;
    pinnedToBottom.current = true;
  }, [conversationId]);

  useEffect(() => {
    if (chatLoading) return;
    if (initialScrollDoneRef.current) return;
    initialScrollDoneRef.current = true;
    prevLastUserMessageIdRef.current = lastUserMessageId;
    scrollModeRef.current = "bottom";
    anchoredUserIdRef.current = null;
    pinnedToBottom.current = true;
    const raf = requestAnimationFrame(() => scrollToBottom("auto"));
    return () => cancelAnimationFrame(raf);
  }, [chatLoading, lastUserMessageId, scrollToBottom]);

  useEffect(() => {
    if (
      !shouldAnchorNewUserMessage(
        prevLastUserMessageIdRef.current,
        lastUserMessageId,
        initialScrollDoneRef.current,
      )
    ) {
      return;
    }
    prevLastUserMessageIdRef.current = lastUserMessageId;
    if (userJustSentRef.current) {
      userScrolledAwayRef.current = false;
      userJustSentRef.current = false;
    }
    const id = lastUserMessageId;
    const raf = requestAnimationFrame(() => {
      if (id) anchorUserBubble(id, "smooth");
    });
    return () => cancelAnimationFrame(raf);
  }, [lastUserMessageId, anchorUserBubble]);

  useEffect(() => {
    if (scrollModeRef.current === "user-anchor" && holdUserAnchor) return;

    if (scrollModeRef.current === "user-anchor" && !holdUserAnchor) {
      scrollModeRef.current = "bottom";
      anchoredUserIdRef.current = null;
      if (userScrolledAwayRef.current) {
        setShowPill(true);
        return;
      }
      const raf = requestAnimationFrame(() => scrollToBottom("smooth"));
      return () => cancelAnimationFrame(raf);
    }

    if (pinnedToBottom.current) {
      const raf = requestAnimationFrame(() => scrollToBottom());
      return () => cancelAnimationFrame(raf);
    }
    setShowPill(true);
  }, [thread.length, holdUserAnchor, pendingQueueItems.length, scrollToBottom]);

  const handleSend = useCallback(
    (text: string, mode?: AgentComposerMode, parts?: StoredMessagePart[]) => {
      userJustSentRef.current = true;
      onSend(text, mode ?? composerMode, parts);
    },
    [onSend, composerMode],
  );

  const handleClarifySelect = useCallback(
    (choice: ClarifyChoice) => {
      onSend(formatClarifyChoiceReply(choice), composerMode);
    },
    [onSend, composerMode],
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

  return (
    <div className="forge-chat-inner">
      <div ref={scrollRef} className="forge-messages" onScroll={handleScroll}>
        {chatLoading && messages.length === 0 ? (
          <div
            className="flex items-center gap-2 py-6 text-[var(--text-muted)]"
            data-testid="forge-chat-loading"
          >
            <Loader2 className="size-4 shrink-0 animate-spin" />
            <span className="text-sm">Carregando conversa…</span>
          </div>
        ) : showEmptyState && messages.length === 0 ? (
          <ChatEmptyState
            onPickSuggestion={(prompt) => {
              setSuggestionPrompt(prompt);
            }}
          />
        ) : (
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
            onClick={() => scrollToBottom("smooth")}
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
        externalPrompt={externalPrompt ?? suggestionPrompt}
        onExternalPromptConsumed={() => {
          setSuggestionPrompt(null);
          onExternalPromptConsumed?.();
        }}
      />
    </div>
  );
}
