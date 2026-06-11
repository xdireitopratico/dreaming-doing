import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useChatState } from "@/hooks-v2/useChatState";
import { useChatMessages } from "@/hooks-v2/useChatMessages";
import { useChatRealtime } from "@/hooks-v2/useChatRealtime";
import { buildChatThread } from "@/lib-v2/chat-thread";
import { ChatThread } from "./ChatThread";
import { ChatComposer } from "./ChatComposer";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";

type ChatPanelProps = {
  projectId: string;
  conversationId: string | null | undefined;
  welcomeMarkdown?: string;
  onOpenInspector?: (runId: string) => void;
  onResume?: () => void;
};

export function ChatPanel({
  projectId,
  conversationId,
  welcomeMarkdown,
  onOpenInspector,
  onResume,
}: ChatPanelProps) {
  const chat = useChatState();
  const { messages, loading } = useChatMessages(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const [showPill, setShowPill] = useState(false);

  useChatRealtime(projectId, conversationId, chat.state.runId, chat.state, {
    onStreamText: chat.updateStreamText,
    onFinished: chat.markFinished,
    onError: chat.markError,
  });

  const thread = buildChatThread(messages, chat.state);

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
    pinnedToBottom.current = dist <= 100;
    if (pinnedToBottom.current) setShowPill(false);
  }, []);

  useEffect(() => {
    if (pinnedToBottom.current) {
      const raf = requestAnimationFrame(() => scrollToBottom());
      return () => cancelAnimationFrame(raf);
    }
    setShowPill(true);
  }, [thread.length, chat.state.streamText, scrollToBottom]);

  const handleSend = (text: string) => {
    if (!conversationId) return;
    chat.sendMessage(projectId, conversationId, text);
  };

  return (
    <div className="forge-chat-inner">
      <div ref={scrollRef} className="forge-messages" onScroll={handleScroll}>
        {loading && messages.length === 0 ? (
          <div className="flex items-center gap-2 py-6" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="size-4 shrink-0 animate-spin" />
            <span className="text-sm">Carregando conversa…</span>
          </div>
        ) : messages.length === 0 && !chat.state.runId ? (
          <div className="forge-msg-text space-y-3">
            {welcomeMarkdown ? (
              <MarkdownRenderer>{welcomeMarkdown}</MarkdownRenderer>
            ) : (
              <p>
                Descreva o que quer construir. O agente gera o código e você vê o resultado à
                direita.
              </p>
            )}
          </div>
        ) : (
          <ChatThread items={thread} onOpenInspector={onOpenInspector} onResume={onResume} />
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
      <ChatComposer status={chat.state.status} onSend={handleSend} onStop={chat.stop} />
    </div>
  );
}
