import { useCallback, useState } from "react";
import { Send, Square } from "lucide-react";
type ChatInputProps = {
  status: "idle" | "running" | "error";
  onSend: (text: string) => void;
  onStop: () => void;
};

export function ChatInput({ status, onSend, onStop }: ChatInputProps) {
  const [text, setText] = useState("");
  const busy = status === "running";

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onSend(trimmed);
    setText("");
  }, [text, busy, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="forge-chat-input-bar">
      <textarea
        className="forge-chat-textarea"
        placeholder="Descreva o que quer construir…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={busy}
      />
      {busy ? (
        <button type="button" className="forge-chat-send-btn" onClick={onStop} aria-label="Parar">
          <Square className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          className="forge-chat-send-btn"
          onClick={handleSend}
          disabled={!text.trim()}
          aria-label="Enviar"
        >
          <Send className="size-4" />
        </button>
      )}
    </div>
  );
}
