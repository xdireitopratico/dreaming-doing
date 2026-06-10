import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, FileText, ImageIcon, MousePointer2, Paperclip, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MicButton } from "@/components/voice/MicButton";
import { ComposerModeSelect } from "@/components/editor/ComposerModeSelect";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isRunning = running || agentBusy;
  const placeholder = isRunning
    ? "Queue follow-up…"
    : "Descreva o que quer construir ou alterar…";

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
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
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
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, attachments, onSend, composerMode]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isRunning) void handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { accepted } = filterAcceptedFiles(Array.from(e.target.files ?? []));
    if (accepted.length) setAttachments((prev) => [...prev, ...accepted].slice(0, 8));
    e.target.value = "";
  };

  return (
    <div className="forge-composer lovable-composer" data-testid="chat-input-v2">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept={CHAT_ATTACHMENT_ACCEPT}
        onChange={handleFileChange}
      />

      {attachments.length > 0 && (
        <div className="mx-1 mb-1 flex flex-wrap gap-1.5">
          {attachments.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--forge-border)] bg-[var(--forge-surface-3)] pl-2 pr-1 py-0.5 text-[10px] text-[var(--forge-muted)]"
            >
              {f.type.startsWith("image/") ? (
                <ImageIcon className="size-3 shrink-0" />
              ) : (
                <FileText className="size-3 shrink-0" />
              )}
              <span className="max-w-[120px] truncate">{f.name}</span>
              <button
                type="button"
                className="grid size-5 place-items-center rounded hover:bg-[var(--forge-surface-2)]"
                onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}
              >
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
        className="forge-composer-input"
      />

      <div className="forge-composer-row">
        <button
          type="button"
          className="forge-composer-icon"
          title="Anexar"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="size-4" />
        </button>

        {onVisualEdits && (
          <button
            type="button"
            className={cn(
              "forge-composer-icon",
              visualEditsActive && "!bg-[var(--forge-primary)]/15 !text-[var(--forge-primary)]",
            )}
            title="Visual edits"
            onClick={onVisualEdits}
          >
            <MousePointer2 className="size-4" />
          </button>
        )}

        <span className="forge-composer-spacer" />

        <ComposerModeSelect value={composerMode} onChange={onComposerModeChange} />

        <MicButton
          size="sm"
          className="forge-composer-mic"
          onTranscript={(t) => setInput((cur) => (cur ? `${cur} ${t}` : t))}
        />

        {isRunning ? (
          <button
            type="button"
            className="forge-composer-send ml-1"
            onClick={onStop}
            title="Parar"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            className="forge-composer-send ml-1"
            onClick={() => void handleSend()}
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