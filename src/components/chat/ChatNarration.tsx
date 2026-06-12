import { MarkdownRenderer } from "@/components/ui/markdown-renderer";

type ChatNarrationProps = {
  text: string;
  streaming?: boolean;
};

export function ChatNarration({ text, streaming = false }: ChatNarrationProps) {
  if (!text?.trim()) return null;
  return (
    <div
      className={streaming ? "forge-chat-streaming-text" : "forge-chat-narration-line"}
      data-testid="chat-narration"
    >
      <MarkdownRenderer variant="chat">{text}</MarkdownRenderer>
    </div>
  );
}
