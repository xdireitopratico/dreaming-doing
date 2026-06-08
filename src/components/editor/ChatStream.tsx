// ChatStream — thread Lovable: user → FORGE (narrativa + detalhes inline por turno)
import { RefreshCw, AlertTriangle, MessageCircle } from "lucide-react";
import { Button } from "@forge/ui";
import type { AgentProgress } from "@/lib/agent-progress";
import type { ChatMessage } from "@/components/editor/ChatInput";
import { useState, useCallback, useMemo } from "react";
import { ErrorHintCard } from "@/components/editor/ErrorHintCard";
import { llmErrorHint, timeoutHint, e2bErrorHint } from "@/lib/llm-error-hints";
import { ForgeAssistantBlock } from "@/components/editor/ForgeAssistantBlock";
import {
  buildLovableThread,
  resolveAssistantProgress,
  type FrozenRunSnapshot,
} from "@/lib/lovable-thread";

export interface ChatStreamProps {
  messages: ChatMessage[];
  running: boolean;
  progress: AgentProgress;
  activeRunId?: string | null;
  frozenRuns?: ReadonlyMap<string, FrozenRunSnapshot>;
  onResume?: () => void;
  onUndoMessage?: (assistantMsgId: string) => void;
  onReopenPlan?: () => void;
}

export function ChatStream({
  messages,
  running,
  progress,
  activeRunId,
  frozenRuns,
  onResume,
  onUndoMessage,
  onReopenPlan,
}: ChatStreamProps) {
  const pendingPlan = progress.pendingPlan;
  const awaitingQualify = progress.awaitingKind === "qualify" && !pendingPlan;

  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());

  const handleCopy = useCallback((text: string, msgId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIds((prev) => new Set(prev).add(msgId));
      setTimeout(() => setCopiedIds((prev) => { const n = new Set(prev); n.delete(msgId); return n; }), 2000);
    });
  }, []);

  const handleUndo = useCallback((assistantMsgId: string) => {
    onUndoMessage?.(assistantMsgId);
  }, [onUndoMessage]);

  const estimatedTokens =
    progress.model && progress.cost > 0
      ? Math.round(
          progress.cost /
            ({ "claude-sonnet-4-20250514": 3, "gpt-4o": 2.5, "gpt-4.1": 2, "gemini-2.5-pro": 1.25, default: 1 } as Record<
              string,
              number
            >)[progress.model] *
            1_000_000,
        )
      : 0;

  const assistantMessages = messages.filter((m) => m.role === "assistant");

  const thread = useMemo(
    () =>
      buildLovableThread(messages, progress, {
        activeRunId,
        running,
        frozenRuns,
      }),
    [messages, progress, activeRunId, running, frozenRuns],
  );

  return (
    <div className="forge-chat-stream" role="log" aria-live="polite" aria-relevant="additions text">
      {awaitingQualify && (
        <section
          className="my-2 rounded-lg border border-amber-400/35 bg-amber-400/8 px-3 py-2.5 flex items-start gap-2"
          aria-label="Aguardando detalhes"
          data-testid="awaiting-user-banner"
        >
          <MessageCircle className="size-4 shrink-0 text-amber-400 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-amber-400">Preciso de mais detalhes</p>
            <p className="text-sm text-[var(--forge-foreground)] leading-relaxed mt-0.5">
              Responda à pergunta do FORGE no campo abaixo para continuar.
            </p>
          </div>
        </section>
      )}

      {thread.map((item, idx) => {
        if (item.kind === "user") {
          return (
            <article key={item.message.id} className="forge-chat-item forge-chat-item-user">
              <span className="forge-chat-sender forge-chat-sender-user">Você</span>
              <div className="forge-msg-user-outline">
                <p className="whitespace-pre-wrap">{item.message.content}</p>
              </div>
            </article>
          );
        }

        const resolved = resolveAssistantProgress(item);
        const assistantIndex = item.message
          ? assistantMessages.findIndex((m) => m.id === item.message!.id)
          : -1;

        return (
          <ForgeAssistantBlock
            key={item.message?.id ?? `live-${item.runId ?? idx}`}
            message={item.message}
            progress={resolved}
            isActive={item.isActive}
            runId={item.runId}
            pendingPlan={pendingPlan}
            onCopy={handleCopy}
            onUndo={handleUndo}
            copiedIds={copiedIds}
            estimatedTokens={estimatedTokens}
            showTokens={assistantIndex === 0}
            onReopenPlan={onReopenPlan}
            onResume={onResume}
          />
        );
      })}

      {!running && progress.resumable && !progress.autoResuming && (
        <div className="space-y-2">
          {progress.error && (() => {
            const isTimeout = /edge.*timeout|120s|edge function.*limite/i.test(progress.error);
            const lower = progress.error.toLowerCase();
            const isE2b = /e2b|sandbox/i.test(lower);
            const hint = isTimeout
              ? timeoutHint()
              : isE2b
                ? e2bErrorHint(progress.error)
                : llmErrorHint(progress.error, false);
            return <ErrorHintCard hint={hint} onAction={onResume} />;
          })()}
          <section className="forge-chat-resume">
            <AlertTriangle className="size-4 text-amber-400 shrink-0" />
            <p className="flex-1 min-w-0 font-mono text-[10px] text-[var(--forge-silver)] leading-relaxed">
              {progress.error
                ? "Execução pausada — histórico salvo no checkpoint."
                : "Execução pausada. O histórico foi salvo — use Continuar para retomar."}
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