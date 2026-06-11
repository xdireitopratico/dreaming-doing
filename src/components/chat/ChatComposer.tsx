import { useCallback, useEffect, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import type { AgentComposerMode } from "@/lib/chat-types";

type ChatComposerProps = {
  running: boolean;
  agentBusy?: boolean;
  planPending?: boolean;
  composerMode?: AgentComposerMode;
  onComposerModeChange?: (mode: AgentComposerMode) => void;
  onSend: (text: string, mode?: AgentComposerMode) => void;
  onStop: () => void;
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
};

const DRAFT_KEY = "forge:chat-draft";
const DRAFT_MAX_AGE = 24 * 60 * 60 * 1000;

export function ChatComposer({
  running,
  agentBusy = false,
  planPending = false,
  composerMode = "plan",
  onComposerModeChange,
  onSend,
  onStop,
  externalPrompt,
  onExternalPromptConsumed,
}: ChatComposerProps) {
  const [text, setText] = useState(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return "";
      const { value, ts } = JSON.parse(raw);
      if (Date.now() - ts < DRAFT_MAX_AGE) return value;
    } catch {
      // ignore
    }
    return "";
  });

  const busy = running || agentBusy;
  const canSend = !busy || planPending;

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ value: text, ts: Date.now() }));
      } catch {
        // ignore
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!externalPrompt?.trim()) return;
    setText(externalPrompt);
    onExternalPromptConsumed?.();
  }, [externalPrompt, onExternalPromptConsumed]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || !canSend) return;
    onSend(trimmed, composerMode);
    setText("");
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }, [text, canSend, onSend, composerMode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const placeholder = planPending
    ? "Mensagem enfileira — aprove ou rejeite o plano no inspector"
    : busy
      ? "Agente ocupado — mensagem vai para a fila"
      : composerMode === "build"
        ? "Descreva o que construir…"
        : "Descreva o que planejar…";

  return (
    <div className="forge-composer">
      {onComposerModeChange && (
        <div className="forge-composer-mode-row">
          <button
            type="button"
            className={`forge-composer-mode-btn ${composerMode === "plan" ? "is-active" : ""}`}
            onClick={() => onComposerModeChange("plan")}
            disabled={busy && !planPending}
          >
            Plan
          </button>
          <button
            type="button"
            className={`forge-composer-mode-btn ${composerMode === "build" ? "is-active" : ""}`}
            onClick={() => onComposerModeChange("build")}
            disabled={busy && !planPending}
          >
            Build
          </button>
        </div>
      )}
      <div className="forge-composer-row">
        <textarea
          className="forge-composer-input"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <div className="forge-composer-actions">
          {running && !planPending ? (
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
              disabled={!text.trim() || !canSend}
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