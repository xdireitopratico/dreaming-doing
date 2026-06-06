// ChatStream — builder chat: mensagens sem bolha + trilha ao vivo (fases, tools, texto)
import { FileText, Loader2, RefreshCw, AlertTriangle, Copy, RotateCcw, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, FadeIn } from "@forge/ui";
import type { AgentProgress } from "@/hooks/useSSE";
import type { ChatMessage } from "@/components/editor/ChatInput";
import { useState, useCallback } from "react";

const PHASE_LABELS: Record<string, string> = {
  gather: "Analisando projeto",
  classify: "Classificando",
  plan: "Planejando",
  execute: "Gerando código",
  observe: "Verificando build",
  summarize: "Finalizando",
  taste_chat: "Concierge",
  done: "Concluído",
};

function MarkdownContent({ children }: { children: string }) {
  return (
    <div
      className="forge-chat-markdown prose prose-invert max-w-none text-sm leading-relaxed
      prose-headings:font-display prose-headings:tracking-tight
      prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
      prose-p:text-[var(--forge-silver)]
      prose-code:font-mono prose-code:text-[11px] prose-code:bg-[var(--forge-surface-2)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
      prose-pre:bg-[var(--forge-surface-1)] prose-pre:border prose-pre:border-[var(--forge-border)] prose-pre:rounded-lg prose-pre:max-w-full prose-pre:overflow-x-auto
      prose-ul:text-[var(--forge-silver)] prose-ol:text-[var(--forge-silver)]
      prose-li:my-0.5
      prose-a:text-[var(--forge-primary)] prose-a:no-underline hover:prose-a:underline
      prose-strong:text-[var(--forge-text)]
      prose-blockquote:border-l-[var(--forge-primary)] prose-blockquote:text-[var(--forge-silver)]
      prose-hr:border-[var(--forge-border)]
      [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[11px]
      [&_pre]:text-[var(--forge-text)]"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

interface AssistantMessageProps {
  msg: ChatMessage;
  index: number;
  totalTokens: number;
  onCopy: (text: string, msgId: string) => void;
  onUndo: (msgId: string) => void;
  copiedIds: Set<string>;
}

function AssistantMessage({ msg, index, totalTokens, onCopy, onUndo, copiedIds }: AssistantMessageProps) {
  const isCopied = copiedIds.has(msg.id);
  const showTokens = index === 0 && totalTokens > 0; // Show tokens on latest assistant message

  return (
    <article key={msg.id} className="forge-chat-item forge-chat-item-assistant relative group">
      <div className="flex items-start justify-between gap-2">
        <span className="forge-chat-sender forge-chat-sender-assistant shrink-0">FORGE</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {showTokens && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[10px] font-mono text-[var(--forge-primary)]">
              <Zap className="size-3" />
              <span>~{totalTokens.toLocaleString()} tokens</span>
            </div>
          )}
          <button
            onClick={() => onCopy(msg.content ?? "", msg.id)}
            className="p-1.5 rounded hover:bg-[var(--forge-surface-2)] transition-colors text-[var(--forge-muted)] hover:text-[var(--forge-foreground)]"
            aria-label={isCopied ? "Copiado!" : "Copiar mensagem"}
            title={isCopied ? "Copiado!" : "Copiar"}
          >
            <Copy className={isCopied ? "size-4 text-[var(--forge-primary)]" : "size-4"} />
          </button>
          <button
            onClick={() => onUndo(msg.id)}
            className="p-1.5 rounded hover:bg-[var(--forge-surface-2)] transition-colors text-[var(--forge-muted)] hover:text-[var(--forge-destructive)]"
            aria-label="Desfazer esta e a mensagem anterior do usuário"
            title="Desfazer"
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
      </div>
      {msg.content ? <MarkdownContent>{msg.content}</MarkdownContent> : null}

      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="forge-tool-inline mt-2">
          <div className="forge-tool-inline-title">
            <FileText className="size-4 text-[var(--forge-primary)]" />
            <span className="truncate">
              {msg.toolCalls[0]?.name}
              {msg.toolCalls[0]?.args ? `: ${msg.toolCalls[0].args.slice(0, 48)}` : ""}
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

export interface ChatStreamProps {
  messages: ChatMessage[];
  running: boolean;
  progress: AgentProgress;
  onResume?: () => void;
  onUndoMessage?: (assistantMsgId: string) => void;
}

export function ChatStream({ messages, running, progress, onResume, onUndoMessage }: ChatStreamProps) {
  const phaseLabel = progress.phase ? (PHASE_LABELS[progress.phase] ?? progress.phase) : null;
  const liveMessage = progress.message?.trim() || null;
  const activeTools = progress.tools.filter((t) => t.ok === undefined);
  const doneTools = progress.tools.filter((t) => t.ok !== undefined).slice(-6);
  const streamText = progress.streamText?.trim() || null;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const showStreamText =
    running &&
    streamText &&
    streamText !== (lastAssistant?.content?.trim() ?? "");

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

  // Calculate total tokens from progress
  const totalTokens = progress.cost > 0 ? Math.round(progress.cost * 1_000_000 / (progress.model ? 1 : 1)) : 0;
  // Better: estimate from model cost
  const estimatedTokens = progress.model && progress.cost > 0
    ? Math.round(progress.cost / ({ "claude-sonnet-4-20250514": 3, "gpt-4o": 2.5, "gpt-4.1": 2, "gemini-2.5-pro": 1.25, "default": 1 } as Record<string, number>)[progress.model] * 1_000_000)
    : 0;

  const assistantMessages = messages.filter(m => m.role === "assistant");

  return (
    <div className="forge-chat-stream" role="log" aria-live="polite" aria-relevant="additions text">
      {messages.map((msg, idx) => {
        if (msg.role === "tool") return null;

        if (msg.role === "user") {
          return (
            <FadeIn key={msg.id} direction="up" distance={4} delay={idx * 0.03}>
              <article className="forge-chat-item forge-chat-item-user">
                <span className="forge-chat-sender forge-chat-sender-user">Você</span>
                <div className="forge-msg-user-outline">
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </article>
            </FadeIn>
          );
        }

        const assistantIndex = assistantMessages.findIndex(m => m.id === msg.id);
        return (
          <FadeIn key={msg.id} direction="up" distance={4} delay={idx * 0.03}>
            <AssistantMessage
              msg={msg}
              index={assistantIndex}
              totalTokens={estimatedTokens}
              onCopy={handleCopy}
              onUndo={handleUndo}
              copiedIds={copiedIds}
            />
          </FadeIn>
        );
      })}

      {running && (
        <section className="forge-chat-live" aria-label="Atividade do agente">
          <div className="forge-chat-live-header">
            <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--forge-primary)]" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--forge-primary)]">
              FORGE
            </span>
            {phaseLabel && (
              <span className="font-mono text-[10px] text-[var(--forge-muted)]">· {phaseLabel}</span>
            )}
            {progress.currentStep != null && progress.totalSteps != null && (
              <span className="font-mono text-[9px] text-[var(--forge-ghost)] ml-auto">
                passo {progress.currentStep}/{progress.totalSteps}
              </span>
            )}
            {progress.model && estimatedTokens > 0 && (
              <span className="font-mono text-[9px] text-[var(--forge-primary)] ml-2">
                ~{estimatedTokens.toLocaleString()} tokens
              </span>
            )}
          </div>

          {liveMessage && <p className="forge-chat-live-line">{liveMessage}</p>}

          {showStreamText && <MarkdownContent>{streamText}</MarkdownContent>}

          {progress.statusHint && (
            <p className="forge-chat-live-hint">{progress.statusHint}</p>
          )}

          {activeTools.length > 0 && (
            <ul className="forge-chat-live-tools">
              {activeTools.map((t, i) => (
                <li key={`${t.name}-${i}`}>
                  <Loader2 className="size-3 animate-spin shrink-0" />
                  <span>{t.name}</span>
                </li>
              ))}
            </ul>
          )}

          {doneTools.length > 0 && (
            <ul className="forge-chat-live-tools forge-chat-live-tools-done">
              {doneTools.map((t, i) => (
                <li key={`done-${t.name}-${i}`} data-ok={t.ok ? "true" : "false"}>
                  <span>{t.name}</span>
                  {t.ok === false && t.error && (
                    <span className="text-amber-400/90 truncate">{t.error.slice(0, 80)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!running && progress.resumable && !progress.autoResuming && (
        <FadeIn direction="up" distance={4}>
          <section className="forge-chat-resume">
            <AlertTriangle className="size-4 text-amber-400 shrink-0" />
            <p className="flex-1 min-w-0 font-mono text-[10px] text-[var(--forge-silver)] leading-relaxed">
              {progress.error ??
                "Execução pausada. O histórico foi salvo — use Continuar para retomar."}
            </p>
            {onResume && (
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={onResume}
              >
                <RefreshCw className="size-3.5 mr-1" />
                Continuar
              </Button>
            )}
          </section>
        </FadeIn>
      )}
    </div>
  );
}