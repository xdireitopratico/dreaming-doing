type ChatNarrationProps = {
  text: string;
  streaming?: boolean;
};

export function ChatNarration({ text, streaming = false }: ChatNarrationProps) {
  if (!text?.trim()) return null;
  return (
    <p
      className={streaming ? "forge-chat-streaming-text" : "forge-chat-narration-line"}
      data-testid="chat-narration"
    >
      {text}
    </p>
  );
}
