import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, ChevronDown, FileText, ImageIcon, MousePointer2, Paperclip, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MicButton } from "@/components/voice/MicButton";
import type { AgentComposerMode } from "@/lib/chat-types";
import {
  CHAT_ATTACHMENT_ACCEPT,
  filesToMessageParts,
  filterAcceptedFiles,
  type StoredMessagePart,
} from "@/lib/chat-attachments";

const CHAT_DRAFT_KEY = "forge:chat-draft-v2";

export type ChatInputV2Props = {
  running: boolean;
  agentBusy?: boolean;
  composerMode: AgentComposerMode;
  onComposerModeChange: (mode: AgentComposerMode) => void;
  onSend: (text: string, mode?: AgentComposerMode, parts?: StoredMessagePart[]) => void;
  onStop: () => void;
  onVisualEdits?: () => void;
  visualEditsActive?: boolean;
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
};

export function ChatInputV2({
  running,
  agentBusy = false,
  composerMode,
  onComposerModeChange,
  onSend,
  onStop,
  onVisualEdits,
  visualEditsActive,
  externalPrompt,
  onExternalPromptConsumed,
}: ChatInputV2Props) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [modeOpen, setModeOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isRunning = running || agentBusy;
  const placeholder = isRunning
    ? "Queue follow-up…"
    : "Descreva o que quer construir…";

  useEffect(() => {
    const timer = setTimeout(() => {
      if (input.trim()) {
        try {
          sessionStorage.setItem(
            CHAT_DRAFT_KEY,
            JSON.stringify({ input, timestamp: Date.now() }),
          );
        } catch {
          /* quota */
        }
      } else {
        sessionStorage.removeItem(CHAT_DRAFT_KEY);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CHAT_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { input: string; timestamp: number };
      if (Date.now() - draft.timestamp < 24 * 60 * 60 * 1000) {
        setInput(draft.input);
      } else {
        sessionStorage.removeItem(CHAT_DRAFT_KEY);
      }
    } catch {
      sessionStorage.removeItem(CHAT_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    if (externalPrompt) {
      setInput(externalPrompt);
      onExternalPromptConsumed?.();
      textareaRef.current?.focus();
    }
  }, [externalPrompt, onExternalPromptConsumed]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    let parts: StoredMessagePart[] | undefined;
    if (attachments.length > 0) {
      parts = await filesToMessageParts(attachments);
    }
    onSend(text, composerMode, parts);
    setInput("");
    setAttachments([]);
    sessionStorage.removeItem(CHAT_DRAFT_KEY);
  }, [input, attachments, onSend, composerMode]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isRunning) handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { accepted } = filterAcceptedFiles(Array.from(e.target.files ?? []));
    if (accepted.length) setAttachments((prev) => [...prev, ...accepted]);
    e.target.value = "";
  };

  return (
    <div className="forge-chat-input-v2 border-t border-[var(--border-forge)] bg-[var(--bg-chat)] p-3" data-testid="chat-input-v2">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept={CHAT_ATTACHMENT_ACCEPT}
        onChange={handleFileChange}
      />

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-forge)] bg-[var(--bg-card)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
            >
              {f.type.startsWith("image/") ? <ImageIcon className="size-3" /> : <FileText className="size-3" />}
              <span className="max-w-[100px] truncate">{f.name}</span>
              <button type="button" onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        className="forge-composer-input w-full resize-none bg-[var(--bg-input)] border border-[var(--border-forge)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-active)]"
      />

      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
          title="Anexar"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="size-4" />
        </button>

        {onVisualEdits && (
          <button
            type="button"
            className={cn(
              "p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]",
              visualEditsActive && "bg-[var(--status-working)]/15 text-[var(--status-working)]",
            )}
            title="Visual edits"
            onClick={onVisualEdits}
          >
            <MousePointer2 className="size-4" />
          </button>
        )}

        <div className="relative">
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[var(--border-forge)] text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            onClick={() => setModeOpen((v) => !v)}
          >
            Build
            <ChevronDown className="size-3" />
          </button>
          {modeOpen && (
            <div className="absolute bottom-full left-0 mb-1 min-w-[120px] rounded-lg border border-[var(--border-forge)] bg-[var(--bg-card)] shadow-lg z-10">
              {(["build", "plan"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    "block w-full px-3 py-2 text-left text-[11px] capitalize hover:bg-[var(--bg-hover)]",
                    composerMode === mode && "text-[var(--status-working)]",
                  )}
                  onClick={() => {
                    onComposerModeChange(mode);
                    setModeOpen(false);
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="flex-1" />

        <MicButton
          size="sm"
          className="text-[var(--text-muted)]"
          onTranscript={(t) => setInput((cur) => (cur ? `${cur} ${t}` : t))}
        />

        {isRunning ? (
          <button
            type="button"
            className="p-2 rounded-lg bg-[var(--status-failed)]/20 text-[var(--status-failed)]"
            onClick={onStop}
            title="Parar"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            className="p-2 rounded-lg bg-[var(--status-working)] text-white disabled:opacity-40"
            onClick={handleSend}
            disabled={!input.trim() && attachments.length === 0}
            title="Enviar"
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}