import { useCallback, useEffect, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import type { ChatStatus } from "@/lib-v2/chat-types";

type ChatComposerProps = {
  status: ChatStatus;
  onSend: (text: string) => void;
  onStop: () => void;
};

const DRAFT_KEY = "forge:chat-draft-v2";
const DRAFT_MAX_AGE = 24 * 60 * 60 * 1000;

export function ChatComposer({ status, onSend, onStop }: ChatComposerProps) {
  const [text, setText] = useState(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return "";
      const { value, ts } = JSON.parse(raw);
      if (Date.now() - ts < DRAFT_MAX_AGE) return value;
    } catch {
      // sessionStorage unavailable or corrupted
    }
    return "";
  });

  const busy = status === "running";

  useEffect(() => {
    const timer = setTimeout(() => {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ value: text, ts: Date.now() }));
    }, 500);
    return () => clearTimeout(timer);
  }, [text]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onSend(trimmed);
    setText("");
    sessionStorage.removeItem(DRAFT_KEY);
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
    <div className="forge-composer">
      <div className="forge-composer-row">
        <textarea
          className="forge-composer-input"
          placeholder={busy ? "Queue follow-up..." : "Descreva o que quer construir…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={busy}
        />
        <div className="forge-composer-actions">
          {busy ? (
            <button
              type="button"
              className="forge-composer-send"
              onClick={onStop}
              aria-label="Parar"
            >
              <Square className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              className="forge-composer-send"
              onClick={handleSend}
              disabled={!text.trim()}
              aria-label="Enviar"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
