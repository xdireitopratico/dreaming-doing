import { useMemo } from "react";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";

type ChatNarrationProps = {
  text: string;
  streaming?: boolean;
};

const STREAMING_MD_THRESHOLD = 200;

export function ChatNarration({ text, streaming = false }: ChatNarrationProps) {
  // Bug #17: durante streaming, só renderiza Markdown quando o texto passa
  // de um limiar. Antes disso, plain text evita re-render do parser
  // a cada token (causa "lag" visível em respostas longas).
  const shouldRenderMarkdown = useMemo(() => {
    if (!streaming) return true;
    return text.length >= STREAMING_MD_THRESHOLD;
  }, [streaming, text.length]);

  if (!text?.trim()) return null;

  return (
    <div
      className={streaming ? "forge-chat-streaming-text" : "forge-chat-narration-line"}
      data-testid="chat-narration"
    >
      {shouldRenderMarkdown ? (
        <MarkdownRenderer variant="chat">{text}</MarkdownRenderer>
      ) : (
        <span className="whitespace-pre-wrap">{text}</span>
      )}
    </div>
  );
}
