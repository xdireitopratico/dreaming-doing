type ChatNarrationProps = {
  text: string;
};

export function ChatNarration({ text }: ChatNarrationProps) {
  if (!text?.trim()) return null;
  return <p className="forge-chat-narration-line">{text}</p>;
}
