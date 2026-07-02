import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, FileText, ImageIcon, MousePointer2, Plus, Square, X } from "lucide-react";
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
import { enableSkillLocal } from "@/lib/agent-extensions-prefs";
import { ContextWindowIndicator } from "@/components/chat/ContextWindowIndicator";
import type { AgentProgress } from "@/lib/agent-progress";

const DRAFT_KEY = "forge:chat-draft";

/** Slash commands → skill id. Ativa a skill on-demand (load direto) sem precisar abrir o painel. */
const SLASH_SKILL_META: Record<string, { id: string; label: string; desc: string }> = {
  "/designsystem": { id: "design-system", label: "Design System", desc: "Composto criacional + 7 principios" },
  "/extractdesign": { id: "extract-design", label: "Extract Design", desc: "Fluxo extract, see, apply de DesignDNA" },
};
const SLASH_SKILLS: Record<string, string> = Object.fromEntries(
  Object.entries(SLASH_SKILL_META).map(([cmd, m]) => [cmd, m.id]),
);
const DRAFT_MAX_AGE = 24 * 60 * 60 * 1000;

type ChatComposerProps = {
  running: boolean;
  agentBusy?: boolean;
  /** Fase 1.9 — quando agentBusy vem de uma run em outra aba/conversa, exibimos
   *  um chip explícito em vez de só desabilitar o composer silenciosamente. */
  busyReason?: "running" | "zombie" | "other_conversation" | null;
  /** Callback pra "Tomar controle" — cancela a run ativa e libera o lock. */
  onTakeOver?: () => void;
  planPending?: boolean;
  /** Fila global pausada — composer livre para envio direto. */
  queuePaused?: boolean;
  composerMode?: AgentComposerMode;
  onComposerModeChange?: (mode: AgentComposerMode) => void;
  onSend: (text: string, mode?: AgentComposerMode, parts?: StoredMessagePart[]) => void;
  onStop: () => void;
  onVisualEdits?: () => void;
  visualEditsActive?: boolean;
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
  contextUsage?: AgentProgress["contextUsage"];
  activeRunId?: string | null;
};

export function ChatComposer({
  running,
  agentBusy = false,
  busyReason = null,
  onTakeOver,
  planPending = false,
  queuePaused = false,
  composerMode = "plan",
  onComposerModeChange,
  onSend,
  onStop,
  onVisualEdits,
  visualEditsActive,
  externalPrompt,
  onExternalPromptConsumed,
  contextUsage,
  activeRunId,
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

  const isRunning = (running || agentBusy) && !queuePaused;

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

  const placeholder = isRunning
    ? "Queue follow-up..."
    : composerMode === "chat"
      ? "Conversa por escrito — sem ferramentas…"
      : composerMode === "plan"
        ? "Descreva o que quer — vou propor um plano…"
        : "Let's build...";

  const addFiles = useCallback((files: File[]) => {
    const { accepted } = filterAcceptedFiles(files);
    if (accepted.length) setAttachments((prev) => [...prev, ...accepted].slice(0, 8));
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;

    // Slash → ativa skill on-demand e tira o token da mensagem.
    let messageText = trimmed;
    const slashCmd = Object.keys(SLASH_SKILLS).find(
      (cmd) => trimmed === cmd || trimmed.startsWith(cmd + " "),
    );
    if (slashCmd) {
      enableSkillLocal(SLASH_SKILLS[slashCmd]);
      messageText = trimmed.slice(slashCmd.length).trim();
      if (!messageText && attachments.length === 0) {
        // Só o slash: carrega a skill e limpa o composer, sem enviar mensagem.
        setText("");
        setAttachments([]);
        try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        return;
      }
    }

    let parts: StoredMessagePart[] | undefined;
    if (attachments.length > 0) {
      parts = await filesToMessageParts(attachments);
    }

    onSend(messageText, composerMode, parts);
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
      const t = text.trim();
      const slashMatches =
        t.startsWith("/") && !text.includes(" ")
          ? Object.keys(SLASH_SKILL_META).filter((cmd) => cmd.startsWith(t.toLowerCase()))
          : [];
      if (e.key === "Tab" && slashMatches.length) {
        e.preventDefault();
        setText(slashMatches[0] + " ");
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        if (slashMatches.length && !SLASH_SKILL_META[t]) {
          e.preventDefault();
          setText(slashMatches[0] + " ");
          return;
        }
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend, text],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData.items;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        addFiles(imageFiles);
      }
    },
    [addFiles],
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
  const showVisualEdits = !!onVisualEdits && !planPending;

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

      {agentBusy && (busyReason === "other_conversation" || busyReason === "zombie") && (
        <div className="forge-composer-busy-banner" data-testid="chat-composer-busy-banner">
          <span className="forge-composer-busy-text">
            {busyReason === "zombie"
              ? "O agente travou nesta conversa. Tome o controle para tentar de novo."
              : "Outra aba ou conversa está rodando o agente. Tome o controle para enviar aqui."}
          </span>
          {onTakeOver && (
            <button
              type="button"
              className="forge-composer-busy-action"
              onClick={onTakeOver}
            >
              Tomar controle
            </button>
          )}
        </div>
      )}

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

      <div style={{ position: "relative" }}>
        {(() => {
          const t = text.trim();
          if (!t.startsWith("/") || text.includes(" ")) return null;
          const matches = Object.entries(SLASH_SKILL_META).filter(([cmd]) =>
            cmd.startsWith(t.toLowerCase()),
          );
          if (!matches.length) return null;
          return (
            <div
              style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                right: 0,
                marginBottom: 4,
                background: "var(--forge-bg, #111)",
                border: "1px solid var(--forge-border, #2a2a2a)",
                borderRadius: 10,
                boxShadow: "0 -8px 24px rgba(0,0,0,0.45)",
                padding: 4,
                zIndex: 50,
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {matches.map(([cmd, m]) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => {
                    setText(cmd + " ");
                    textareaRef.current?.focus();
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    color: "inherit",
                    padding: "8px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <strong style={{ color: "var(--forge-accent, #7dd3fc)" }}>{cmd}</strong>
                    <span style={{ opacity: 0.85, fontSize: 13 }}>{m.label}</span>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{m.desc}</div>
                </button>
              ))}
            </div>
          );
        })()}
        <textarea
          ref={textareaRef}
          className="forge-composer-input"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
        />
      </div>

      <div className="forge-composer-row">
        <div className="forge-composer-row-start">
          <button
            type="button"
            className="forge-composer-add"
            title="Anexar"
            aria-label="Anexar"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="size-4" />
          </button>

          <ContextWindowIndicator
            contextUsage={contextUsage}
            activeRunId={activeRunId}
            running={running}
          />

          {showVisualEdits && (
            <button
              type="button"
              className={cn(
                "forge-composer-visual-edits",
                visualEditsActive && "forge-composer-visual-edits--active",
              )}
              aria-label="Visual edits"
              title="Visual edits"
              onClick={onVisualEdits}
            >
              <MousePointer2 className="size-3.5 shrink-0" />
            </button>
          )}
        </div>

        <span className="forge-composer-spacer" aria-hidden />

        <div className="forge-composer-row-end">
          {onComposerModeChange && (
            <ComposerModeSelect value={composerMode} onChange={onComposerModeChange} />
          )}

          <MicButton
            variant="composer"
            size="sm"
            onTranscript={(t) => setText((cur: string) => (cur ? `${cur} ${t}` : t))}
          />

          <button
            type="button"
            className={running ? "forge-composer-stop" : "forge-composer-send"}
            onClick={running ? onStop : () => void handleSend()}
            disabled={!running && !canSubmit}
            title={
              running
                ? "Parar"
                : isRunning
                  ? "Enfileirar"
                  : "Enviar"
            }
            aria-label={
              running
                ? "Parar"
                : isRunning
                  ? "Enfileirar"
                  : "Enviar"
            }
          >
            {running ? (
              <Square className="size-3.5 fill-current" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
