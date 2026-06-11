import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
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

const DRAFT_KEY = "forge:chat-draft";
const DRAFT_MAX_AGE = 24 * 60 * 60 * 1000;

type ChatComposerProps = {
  running: boolean;
  agentBusy?: boolean;
  planPending?: boolean;
  composerMode?: AgentComposerMode;
  onComposerModeChange?: (mode: AgentComposerMode) => void;
  onSend: (text: string, mode?: AgentComposerMode, parts?: StoredMessagePart[]) => void;
  onStop: () => void;
  onVisualEdits?: () => void;
  visualEditsActive?: boolean;
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
};

export function ChatComposer({
  running,
  agentBusy = false,
  planPending = false,
  composerMode = "plan",
  onComposerModeChange,
  onSend,
  onStop,
  onVisualEdits,
  visualEditsActive,
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
  const [attachments, setAttachments] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isRunning = running || agentBusy;

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (text.trim()) {
          sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ value: text, ts: Date.now() }));
        } else {
          sessionStorage.removeItem(DRAFT_KEY);
        }
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
    textareaRef.current?.focus();
  }, [externalPrompt, onExternalPromptConsumed]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const placeholder = planPending
    ? "Diga o que fazer em vez disso…"
    : isRunning
      ? "Queue follow-up…"
      : composerMode === "build"
        ? "Descreva o que construir…"
        : "Descreva o que planejar…";

  const addFiles = useCallback((files: File[]) => {
    const { accepted } = filterAcceptedFiles(files);
    if (accepted.length) setAttachments((prev) => [...prev, ...accepted].slice(0, 8));
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;

    let parts: StoredMessagePart[] | undefined;
    if (attachments.length > 0) {
      parts = await filesToMessageParts(attachments);
    }

    onSend(trimmed, composerMode, parts);
    setText("");
    setAttachments([]);
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [text, attachments, onSend, composerMode]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const canSubmit = text.trim().length > 0 || attachments.length > 0;

  return (
    <div
      className={cn("forge-composer", dragOver && "forge-composer--drag-over")}
      data-testid="chat-composer"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept={CHAT_ATTACHMENT_ACCEPT}
        onChange={handleFileChange}
      />

      {attachments.length > 0 && (
        <div className="forge-composer-attachments">
          {attachments.map((f, i) => (
            <span key={`${f.name}-${i}`} className="forge-composer-attachment">
              {f.type.startsWith("image/") ? (
                <ImageIcon className="size-3 shrink-0" />
              ) : (
                <FileText className="size-3 shrink-0" />
              )}
              <span className="max-w-[120px] truncate">{f.name}</span>
              <button
                type="button"
                className="forge-composer-attachment-remove"
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
        className="forge-composer-input"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
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
              visualEditsActive && "forge-composer-icon--active",
            )}
            title="Visual edits"
            onClick={onVisualEdits}
          >
            <MousePointer2 className="size-4" />
          </button>
        )}

        <span className="forge-composer-spacer" />

        {onComposerModeChange && (
          <ComposerModeSelect value={composerMode} onChange={onComposerModeChange} />
        )}

        <MicButton
          size="sm"
          className="forge-composer-mic"
          onTranscript={(t) => setText((cur: string) => (cur ? `${cur} ${t}` : t))}
        />

        {running && (
          <button
            type="button"
            className="forge-composer-send ml-1"
            onClick={onStop}
            title="Parar"
            aria-label="Parar"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        )}
        <button
          type="button"
          className="forge-composer-send ml-1"
          onClick={() => void handleSend()}
          disabled={!canSubmit}
          title={isRunning ? "Enfileirar" : "Enviar"}
          aria-label={isRunning ? "Enfileirar" : "Enviar"}
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  );
}