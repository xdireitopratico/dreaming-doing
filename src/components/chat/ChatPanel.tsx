import { useCallback, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AgentComposerMode, ChatMessage } from "@/lib/chat-types";
import { formatClarifyChoiceReply } from "@/lib/clarify-choices";
import type { ClarifyChoice } from "@/lib/chat/types";
import type { StoredMessagePart } from "@/lib/chat-attachments";
import { useChat } from "@/hooks/useChat";
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
  // busyReason + takeOver vêm do useChat (Fase 1.9).

  /** Fase 2.5 — quando o user clica num card de sugestão do empty state,
   *  setamos este state que alimenta `externalPrompt` no ChatComposer. */
  const [suggestionPrompt, setSuggestionPrompt] = useState<string | null>(null);

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

  // Âncora UMA vez quando o usuário envia nova mensagem. A partir daí o
  // navegador mantém a bolha no topo via scroll anchoring nativo.
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

  // Fonte única de verdade para scroll durante/after o run:
  //  - ancorado + run ativo → não mexe (navegador segura a âncora)
  //  - fim do run estando ancorado → leva ao resultado, ou pill se o usuário rolou pra cima
  //  - modo bottom → auto-segue o streaming
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

  // Quando o plano aparece (pendingPlan de null → objeto), leva ao fim para
  // mostrar o card de plano + os botões de aprovação acima do composer fixo.
  const planSignature = pendingPlan ? `${pendingPlan.planId}:${pendingPlan.steps.length}` : null;
  useEffect(() => {
    if (!planSignature) return;
    const raf = requestAnimationFrame(() => scrollToBottom("smooth"));
    return () => cancelAnimationFrame(raf);
  }, [planSignature, scrollToBottom]);

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

  // Clarify — texto próprio: usuário digita resposta livre e envia como user msg.
  const handleClarifyCustomReply = useCallback(
    (text: string) => {
      onSend(text, composerMode);
    },
    [onSend, composerMode],
  );

  // Clarify — skip: usuário decide pular a pergunta. Sinal explícito pro agente.
  const handleClarifySkip = useCallback(() => {
    onSend("[skip] Prefiro pollar essa pergunta.", composerMode);
  }, [onSend, composerMode]);

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

  const showPlanDock =
    !!pendingPlan || (running && agent.progress.phase === "creating_plan");

  return (
    <div className="forge-chat-inner">
      <div className="forge-messages">
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
          <>
            <ChatThread
              items={thread}
              onOpenInspector={onOpenInspector}
              onClarifySelect={handleClarifySelect}
              onClarifyCustomReply={handleClarifyCustomReply}
              onClarifySkip={handleClarifySkip}
              onRollback={onRollbackMessage ? handleRollback : undefined}
              onResume={onResume}
              lastUserMessageId={lastUserMessageId}
              lastAssistantMessageId={lastAssistantMessageId}
            />

            {showPlanDock && (
              <ChatPlanDock
                pendingPlan={pendingPlan}
                creating={running && agent.progress.phase === "creating_plan" && !pendingPlan}
                onReview={(runId) => onOpenInspector?.(runId, "plan")}
                onApprove={onPlanApprove}
                onReject={onPlanReject}
              />
            )}
          </>
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

        busyReason={busyReason}
        onTakeOver={takeOver}
        planPending={!!pendingPlan}
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