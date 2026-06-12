import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AgentComposerMode, ChatMessage } from "@/lib/chat-types";
import type { StoredMessagePart } from "@/lib/chat-attachments";
import { useChat } from "@/hooks/useChat";
import { ChatThread } from "./ChatThread";
import { ChatComposer } from "./ChatComposer";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { PendingQueuePanel, type PendingQueueItem } from "@/components/editor/PendingQueuePanel";
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
  welcomeMarkdown?: string;
  composerMode?: AgentComposerMode;
  onComposerModeChange?: (mode: AgentComposerMode) => void;
  onSend: (text: string, mode?: AgentComposerMode, parts?: StoredMessagePart[]) => void;
  onStop: () => void;
  onResume?: () => void;
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
  onRollbackMessage?: (
    messageId: string,
    role: "user" | "assistant",
  ) => Promise<{ ok: boolean; error?: string }>;
  focusedRunId?: string | null;
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
  tasteChatRemaining?: number;
  tasteStartRemaining?: number;
  onStartProject?: () => void;
  pendingQueueItems?: PendingQueueItem[];
  queueBlockingReason?: string | null;
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
  welcomeMarkdown,
  composerMode = "plan",
  onComposerModeChange,
  onSend,
  onStop,
  onResume,
  onOpenInspector,
  onRollbackMessage,
  focusedRunId,
  externalPrompt,
  onExternalPromptConsumed,
  tasteChatRemaining,
  tasteStartRemaining,
  onStartProject,
  pendingQueueItems = [],
  queueBlockingReason,
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
  const [showPill, setShowPill] = useState(false);
  const PIN_THRESHOLD_PX = 100;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    pinnedToBottom.current = true;
    setShowPill(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottom.current = dist <= PIN_THRESHOLD_PX;
    if (pinnedToBottom.current) setShowPill(false);
  }, []);

  useEffect(() => {
    if (pinnedToBottom.current) {
      const raf = requestAnimationFrame(() => scrollToBottom());
      return () => cancelAnimationFrame(raf);
    }
    setShowPill(true);
  }, [thread.length, running, agent.progress.timeline.length, pendingQueueItems.length, scrollToBottom]);

  const handleSend = useCallback(
    (text: string, mode?: AgentComposerMode, parts?: StoredMessagePart[]) => {
      onSend(text, mode ?? composerMode, parts);
    },
    [onSend, composerMode],
  );

  const handleQualifySelect = useCallback(
    (text: string) => {
      onSend(text, composerMode);
    },
    [onSend, composerMode],
  );

  const lastUserMessageId = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      const item = thread[i];
      if (item?.kind === "user") return item.message.id;
    }
    return null;
  }, [thread]);

  const handleRollback = useCallback(
    async (messageId: string) => {
      if (!onRollbackMessage) return;
      await onRollbackMessage(messageId, "user");
    },
    [onRollbackMessage],
  );

  return (
    <div className="forge-chat-inner">
      <div ref={scrollRef} className="forge-messages" onScroll={handleScroll}>
        {showEmptyState ? (
          <div className="forge-msg-text space-y-3">
            {chatLoading ? (
              <div
                className="flex items-center gap-2 py-6 text-[var(--text-muted)]"
                data-testid="forge-chat-loading"
              >
                <Loader2 className="size-4 shrink-0 animate-spin" />
                <span className="text-sm">Carregando conversa…</span>
              </div>
            ) : welcomeMarkdown ? (
              <MarkdownRenderer>{welcomeMarkdown}</MarkdownRenderer>
            ) : (
              <p>
                Descreva o que quer construir. O agente gera o código e você vê o resultado à
                direita.
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {!chatLoading && onStartProject && (tasteStartRemaining ?? 0) > 0 && (
                <button type="button" onClick={onStartProject} className="forge-welcome-btn">
                  Start Project · demo completa (~15 min)
                </button>
              )}
            </div>
            {tasteChatRemaining != null && tasteChatRemaining <= 0 && (
              <p className="forge-welcome-limit">
                Limite Taste Chat atingido. Configure chaves em API para continuar.
              </p>
            )}
          </div>
        ) : (
          <ChatThread
            items={thread}
            onOpenInspector={onOpenInspector}
            onQualifySelect={handleQualifySelect}
            onResume={onResume}
            onRollback={onRollbackMessage ? handleRollback : undefined}
            lastUserMessageId={lastUserMessageId}
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
        planPending={!!pendingPlan}
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