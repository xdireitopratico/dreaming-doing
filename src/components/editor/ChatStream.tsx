// ChatStream — builder chat: mensagens sem bolha + trilha ao vivo (fases, tools, texto)
import { FileText, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import type { AgentProgress } from "@/hooks/useSSE";
import type { ChatMessage } from "@/components/editor/ChatInput";

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

export interface ChatStreamProps {
  messages: ChatMessage[];
  running: boolean;
  progress: AgentProgress;
  onResume?: () => void;
}

export function ChatStream({ messages, running, progress, onResume }: ChatStreamProps) {
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

  return (
    <div className="forge-chat-stream" role="log" aria-live="polite" aria-relevant="additions text">
      {messages.map((msg) => {
        if (msg.role === "tool") return null;

        if (msg.role === "user") {
          return (
            <article key={msg.id} className="forge-chat-item forge-chat-item-user">
              <span className="forge-chat-sender forge-chat-sender-user">Você</span>
              <div className="forge-msg-user-outline">
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </article>
          );
        }

        return (
          <article key={msg.id} className="forge-chat-item forge-chat-item-assistant">
            <span className="forge-chat-sender forge-chat-sender-assistant">FORGE</span>
            {msg.content ? <MarkdownContent>{msg.content}</MarkdownContent> : null}

            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="forge-tool-inline">
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

      {!running && progress.resumable && (
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
              className="bg-[var(--forge-primary)] text-[#0a0a0a] hover:bg-[var(--forge-primary-hot)] shrink-0"
              onClick={onResume}
            >
              <RefreshCw className="size-3.5 mr-1" />
              Continuar
            </Button>
          )}
        </section>
      )}
    </div>
  );
}