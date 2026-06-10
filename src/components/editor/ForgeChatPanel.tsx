import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { AgentProgress, PlanStep } from "@/lib/agent-progress";
import type { AgentComposerMode, ChatMessage } from "@/lib/chat-types";
import type { FrozenRunSnapshot } from "@/lib/lovable-thread";
import { resolvePendingPlan } from "@/lib/plan-message-meta";
import { resolveEffectiveAgentProgress } from "@/lib/resolve-agent-progress";
import { buildOutgoingParts, type StoredMessagePart } from "@/lib/chat-attachments";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import { getAgentSetupBlockMessage, isAgentPreferencesConfigured } from "@/lib/agent-setup";
import { toast } from "@/lib/toast";
import { ForgeChat } from "@/components/editor/ForgeChat";
import { ChatInputV2 } from "@/components/editor/ChatInputV2";
import { PendingQueuePanel, type PendingQueueItem } from "@/components/editor/PendingQueuePanel";

export type ForgeChatPanelProps = {
  messages: ChatMessage[];
  running: boolean;
  onSend: (text: string, mode?: AgentComposerMode, parts?: StoredMessagePart[]) => void;
  onStop: () => void;
  onVisualEdits?: () => void;
  visualEditsActive?: boolean;
  composerMode?: AgentComposerMode;
  onComposerModeChange?: (mode: AgentComposerMode) => void;
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
  welcomeMarkdown?: string;
  tasteChatRemaining?: number;
  tasteStartRemaining?: number;
  onStartProject?: () => void;
  agentProgress?: AgentProgress;
  activeRunId?: string | null;
  frozenRuns?: ReadonlyMap<string, FrozenRunSnapshot>;
  onResumeAgent?: () => void;
  onDeploy?: () => void | Promise<void>;
  onUndoMessage?: (assistantMsgId: string) => void;
  pendingQueueItems?: PendingQueueItem[];
  queueBlockingReason?: string | null;
  onClearPendingItem?: (id: string) => Promise<void>;
  onClearAllPending?: () => Promise<void>;
  onDrainQueue?: () => Promise<void>;
  onOpenInspector?: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
  focusedRunId?: string | null;
};

export function ForgeChatPanel({
  messages,
  running,
  onSend,
  onStop,
  onVisualEdits,
  visualEditsActive,
  composerMode: composerModeProp,
  onComposerModeChange,
  externalPrompt,
  onExternalPromptConsumed,
  welcomeMarkdown,
  tasteChatRemaining,
  tasteStartRemaining,
  onStartProject,
  agentProgress,
  activeRunId,
  frozenRuns,
  onResumeAgent,
  onDeploy,
  onUndoMessage,
  pendingQueueItems = [],
  queueBlockingReason,
  onClearPendingItem,
  onClearAllPending,
  onDrainQueue,
  onOpenInspector,
  focusedRunId,
}: ForgeChatPanelProps) {
  const [composerModeLocal, setComposerModeLocal] = useState<AgentComposerMode>("build");
  const composerMode = composerModeProp ?? composerModeLocal;
  const setComposerMode = onComposerModeChange ?? setComposerModeLocal;

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const [showNewMessagesPill, setShowNewMessagesPill] = useState(false);
  const PIN_THRESHOLD_PX = 100;

  const effectiveProgress = useMemo(
    () => resolveEffectiveAgentProgress(agentProgress, messages),
    [agentProgress, messages],
  );

  const pendingPlan = useMemo(
    () => resolvePendingPlan(agentProgress?.pendingPlan ?? null, messages),
    [agentProgress?.pendingPlan, messages],
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    pinnedToBottomRef.current = true;
    setShowNewMessagesPill(false);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = distanceFromBottom <= PIN_THRESHOLD_PX;
    if (pinnedToBottomRef.current) setShowNewMessagesPill(false);
  }, []);

  useEffect(() => {
    if (pinnedToBottomRef.current) {
      const raf = requestAnimationFrame(() => scrollToBottom("auto"));
      return () => cancelAnimationFrame(raf);
    }
    setShowNewMessagesPill(true);
  }, [messages.length, running, effectiveProgress.timeline.length, scrollToBottom]);

  const handleSend = useCallback(
    async (text: string, mode?: AgentComposerMode, parts?: StoredMessagePart[]) => {
      if (running) return;

      if (text.startsWith("/deploy")) {
        await onDeploy?.();
        return;
      }

      const prefs = loadAgentPreferences();
      if (!isAgentPreferencesConfigured(prefs)) {
        toast.error(getAgentSetupBlockMessage(prefs));
        return;
      }

      const outgoing = buildOutgoingParts(text, parts ?? []);
      if (outgoing.length === 0) return;
      onSend(text, mode ?? composerMode, outgoing);
    },
    [running, onDeploy, onSend, composerMode],
  );

  const agentBusy = !!(
    agentProgress &&
    !agentProgress.finished &&
    !agentProgress.canceled
  );

  return (
    <div className="forge-chat-inner">
      <div ref={scrollRef} className="forge-messages" onScroll={handleMessagesScroll}>
        {messages.length === 0 ? (
          <div className="forge-msg-text space-y-3">
            {welcomeMarkdown ? (
              <MarkdownRenderer>{welcomeMarkdown}</MarkdownRenderer>
            ) : (
              <p>Descreva o que quer construir. O agente gera o código e você vê o resultado à direita.</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {onStartProject && (tasteStartRemaining ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={onStartProject}
                  className="forge-welcome-btn"
                >
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
          <ForgeChat
            messages={messages}
            running={running}
            progress={effectiveProgress}
            activeRunId={activeRunId}
            frozenRuns={frozenRuns}
            pendingQueueItems={pendingQueueItems}
            pendingPlan={pendingPlan}
            onResume={onResumeAgent}
            onUndoMessage={onUndoMessage}
            onOpenInspector={onOpenInspector}
            focusedRunId={focusedRunId}
          />
        )}

        {showNewMessagesPill && (
          <button
            type="button"
            className="forge-new-messages-pill"
            onClick={() => scrollToBottom("smooth")}
          >
            Novas mensagens
          </button>
        )}
      </div>

      {((agentProgress?.pendingQueueCount ?? 0) > 0 && pendingQueueItems.length > 0) ||
      (queueBlockingReason && running) ? (
        <PendingQueuePanel
          items={pendingQueueItems}
          pendingCount={agentProgress?.pendingQueueCount ?? 0}
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

      <ChatInputV2
        running={running}
        agentBusy={agentBusy}
        composerMode={composerMode}
        onComposerModeChange={setComposerMode}
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

export type { ChatMessage, AgentComposerMode, PlanStep };