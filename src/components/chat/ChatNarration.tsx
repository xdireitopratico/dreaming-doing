import { useMemo } from "react";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";

type ChatNarrationProps = {
  text: string;
  streaming?: boolean;
};

const STREAMING_MD_THRESHOLD = 80;

function looksLikeMarkdown(text: string): boolean {
  return /```|(^|\n)#{1,3}\s|(^|\n)[-*]\s/m.test(text);
}

export function ChatNarration({ text, streaming = false }: ChatNarrationProps) {
  const shouldRenderMarkdown = useMemo(() => {
    if (!streaming) return true;
    if (looksLikeMarkdown(text)) return true;
    return text.length >= STREAMING_MD_THRESHOLD;
  }, [streaming, text]);

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
