// ChatInput.tsx — Input aprimorado com /commands, @file autocomplete, markdown render, auto-resize
// Botão de parar visível durante execução, drag de imagens, typewriter nas respostas
import { useState, useRef, useCallback, useEffect, useMemo, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import {
  ArrowUp,
  Square,
  FileText,
  Paperclip,
  ImageIcon,
  MousePointer2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { MicButton } from "@/components/voice/MicButton";
import { toast } from "sonner";
import {
  buildOutgoingParts,
  CHAT_ATTACHMENT_ACCEPT,
  filesToMessageParts,
  filterAcceptedFiles,
  type StoredMessagePart,
} from "@/lib/chat-attachments";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import {
  getAgentSetupBlockMessage,
  isAgentPreferencesConfigured,
} from "@/lib/agent-setup";
import { ChatStream } from "@/components/editor/ChatStream";
import { ComposerModeSelect } from "@/components/editor/ComposerModeSelect";
import type { AgentProgress, PlanStep } from "@/lib/agent-progress";
import { resolveEffectiveAgentProgress } from "@/lib/resolve-agent-progress";

export type AgentComposerMode = "plan" | "build";

// -----------------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{ name: string; args: string }>;
  meta?: Record<string, unknown> | null;
  runId?: string;
  timestamp: number;
}

interface ChatInputProps {
  messages: ChatMessage[];
  running: boolean;
  onSend: (text: string, mode?: AgentComposerMode, parts?: StoredMessagePart[]) => void;
  onStop: () => void;
  files: string[];
  onVisualEdits?: () => void;
  visualEditsActive?: boolean;
  composerMode?: AgentComposerMode;
  onComposerModeChange?: (mode: AgentComposerMode) => void;
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
  /** Markdown exibido quando não há mensagens (boas-vindas / tira-gosto). */
  welcomeMarkdown?: string;
  tasteChatRemaining?: number;
  tasteStartRemaining?: number;
  onStartProject?: () => void;
  /** Trilha ao vivo do agente (fases, tools) — renderizada no painel de mensagens. */
  agentProgress?: AgentProgress;
  activeRunId?: string | null;
  frozenRuns?: ReadonlyMap<string, import("@/lib/lovable-thread").FrozenRunSnapshot>;
  /** Fase 4.6: plano aguardando aprovação. */
  onPlanApprove?: (steps: PlanStep[]) => void;
  onPlanReject?: (reason?: string) => void;
  onReopenPlan?: () => void;
  onResumeAgent?: () => void;
  /** Slash /deploy — mesmo fluxo que Publicar na topbar */
  onDeploy?: () => void | Promise<void>;
  /** Undo última mensagem do assistente + mensagem do usuário anterior */
  onUndoMessage?: (assistantMsgId: string) => void;
}

// -----------------------------------------------------------------------------------
// Slash commands
// -----------------------------------------------------------------------------------

interface Command {
  id: string;
  label: string;
  description: string;
  icon: string;
}

const COMMANDS: Command[] = [
  { id: "/fix", label: "/fix", description: "Corrigir erros do build atual", icon: "🔧" },
  { id: "/deploy", label: "/deploy", description: "Publicar o projeto", icon: "🚀" },
  { id: "/explain", label: "/explain", description: "Explicar o que o agente está fazendo", icon: "💡" },
  { id: "/undo", label: "/undo", description: "Reverter última ação", icon: "↩" },
  { id: "/retry", label: "/retry", description: "Tentar abordagem diferente", icon: "🔄" },
  { id: "/skills", label: "/skills", description: "Gerenciar skills do projeto", icon: "🧩" },
  { id: "/settings", label: "/settings", description: "Configurações do projeto", icon: "⚙" },
];



// -----------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------
// ChatInput
// -----------------------------------------------------------------------------------

export function ChatInput({
  messages,
  running,
  onSend,
  onStop,
  files,
  composerMode: composerModeProp,
  onComposerModeChange,
  externalPrompt,
  onExternalPromptConsumed,
  welcomeMarkdown,
  tasteChatRemaining,
  tasteStartRemaining,
  onStartProject,
  onVisualEdits,
  visualEditsActive,
  agentProgress,
  activeRunId,
  frozenRuns,
  onResumeAgent,
  onDeploy,
  onUndoMessage,
  onPlanApprove,
  onPlanReject,
  onReopenPlan,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [composerModeLocal, setComposerModeLocal] = useState<AgentComposerMode>("plan");
  const composerMode = composerModeProp ?? composerModeLocal;
  const setComposerMode = onComposerModeChange ?? setComposerModeLocal;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showCommands, setShowCommands] = useState(false);
  const [showFileSuggest, setShowFileSuggest] = useState(false);
  const [filteredFiles, setFilteredFiles] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<string[]>([]);
  const effectiveProgress = useMemo(
    () => resolveEffectiveAgentProgress(agentProgress, messages),
    [agentProgress, messages],
  );
  useEffect(() => {
    if (externalPrompt) {
      setInput(externalPrompt);
      onExternalPromptConsumed?.();
      textareaRef.current?.focus();
    }
  }, [externalPrompt, onExternalPromptConsumed]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, running, agentProgress?.phase, agentProgress?.tools.length]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  // Detect /commands
  useEffect(() => {
    if (input.startsWith("/") && !input.includes(" ")) {
      setShowCommands(true);
      setShowFileSuggest(false);
    } else {
      setShowCommands(false);
    }

    // Detect @file mentions
    const lastAt = input.lastIndexOf("@");
    if (lastAt >= 0) {
      const query = input.slice(lastAt + 1).toLowerCase();
      setFilteredFiles(
        files
          .filter((f) => f.toLowerCase().includes(query))
          .slice(0, 5),
      );
      setShowFileSuggest(true);
    } else {
      setShowFileSuggest(false);
    }
  }, [input, files]);

  const insertCommand = (cmd: Command) => {
    if (cmd.id === "/deploy" && onDeploy) {
      setInput("");
      setShowCommands(false);
      void onDeploy();
      return;
    }
    setInput(cmd.id + " ");
    setShowCommands(false);
    textareaRef.current?.focus();
  };

  const insertFile = (filePath: string) => {
    const lastAt = input.lastIndexOf("@");
    const newInput = input.slice(0, lastAt) + filePath + input.slice(lastAt + filePath.length + 1);
    setInput(newInput);
    setShowFileSuggest(false);
    textareaRef.current?.focus();
  };

  const addAttachmentFiles = useCallback((incoming: File[]) => {
    if (!incoming.length) return;
    const { accepted, rejected } = filterAcceptedFiles(incoming);
    if (rejected.length) {
      toast.warning(`Não aceito: ${rejected.slice(0, 3).join(", ")}${rejected.length > 3 ? "…" : ""}`);
    }
    if (!accepted.length) return;
    setAttachments((prev) => [...prev, ...accepted].slice(0, 8));
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || running) return;

    if (text.startsWith("/deploy")) {
      setInput("");
      setAttachments([]);
      await onDeploy?.();
      return;
    }

    const prefs = loadAgentPreferences();
    if (!isAgentPreferencesConfigured(prefs)) {
      toast.error(getAgentSetupBlockMessage(prefs));
      return;
    }

    let attachmentParts: StoredMessagePart[] = [];
    if (attachments.length > 0) {
      try {
        attachmentParts = await filesToMessageParts(attachments);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Erro ao ler anexos");
        return;
      }
    }

    // Fase 4.7: o modo é enviado separadamente via onSend(text, mode).
    // Sem prefix textual — servidor decide se liga planMode ou não.
    const outgoing = buildOutgoingParts(
      text,
      attachmentParts,
    );
    if (outgoing.length === 0) return;

    if (text) {
      historyRef.current.push(text);
      setHistoryIndex(-1);
    }
    setInput("");
    setAttachments([]);
    onSend(text, composerMode, outgoing);
  };

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addAttachmentFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(e.clipboardData.files ?? []);
    if (pasted.length > 0) {
      e.preventDefault();
      addAttachmentFiles(pasted);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Commands navigation
    if (showCommands) {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (COMMANDS.length > 0) {
          insertCommand(COMMANDS[0]);
        }
        return;
      }
      if (e.key === "Escape") {
        setShowCommands(false);
        return;
      }
    }

    // File suggest navigation
    if (showFileSuggest) {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredFiles.length > 0) {
          insertFile(filteredFiles[0]);
        }
        return;
      }
      if (e.key === "Escape") {
        setShowFileSuggest(false);
        return;
      }
    }

    // Send
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    // History navigation
    if (e.key === "ArrowUp" && input === "") {
      e.preventDefault();
      if (historyIndex < historyRef.current.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(historyRef.current[historyRef.current.length - 1 - newIndex] ?? "");
      }
    }
    if (e.key === "ArrowDown" && historyIndex >= 0) {
      e.preventDefault();
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      if (newIndex < 0) {
        setInput("");
      } else {
        setInput(historyRef.current[historyRef.current.length - 1 - newIndex] ?? "");
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addAttachmentFiles(Array.from(e.dataTransfer.files ?? []));
  };

  return (
    <div className="forge-chat-inner" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      <div ref={scrollRef} className="forge-messages">
        {messages.length === 0 ? (
          <div className="forge-msg-text space-y-3">
            {welcomeMarkdown ? (
              <MarkdownRenderer>{welcomeMarkdown}</MarkdownRenderer>
            ) : (
              <p>
                Descreva o que você quer construir ou alterar. O FORGE gera o código e você vê o
                resultado ao vivo à direita.
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {onStartProject && (tasteStartRemaining ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={onStartProject}
                  className="rounded-lg border border-[var(--forge-primary)]/50 bg-[var(--forge-primary)]/10 px-3 py-2 font-mono text-[10px] text-[var(--forge-primary)] hover:bg-[var(--forge-primary)]/20 transition-colors"
                >
                  Start Project · demo completa (~15 min)
                </button>
              )}
              <a
                href="/api"
                className="rounded-lg border border-[var(--forge-border)] px-3 py-2 font-mono text-[10px] text-[var(--forge-muted)] hover:border-[var(--forge-primary)]/40 transition-colors"
              >
                Configurar API →
              </a>
            </div>
            {tasteChatRemaining != null && tasteChatRemaining <= 0 && (
              <p className="font-mono text-[10px] text-amber-400/90 border border-amber-400/20 rounded-lg px-3 py-2">
                Limite Taste Chat (50) atingido. Adicione suas chaves em{" "}
                <a href="/api" className="text-[var(--forge-primary)] underline">
                  API
                </a>{" "}
                para continuar.
              </p>
            )}
            {tasteChatRemaining != null && tasteChatRemaining > 0 && (
              <p className="font-mono text-[9px] text-[var(--forge-ghost)]">
                Taste Chat: {tasteChatRemaining} mensagens · Concierge NVIDIA
                {(tasteStartRemaining ?? 0) > 0 ? ` · Start Project: ${tasteStartRemaining} restante` : ""}
              </p>
            )}
          </div>
        ) : (
            <ChatStream
              messages={messages}
              running={running}
              activeRunId={activeRunId}
              frozenRuns={frozenRuns}
              progress={effectiveProgress}
              onResume={onResumeAgent}
              onUndoMessage={onUndoMessage}
              onReopenPlan={onReopenPlan}
              onPlanApprove={onPlanApprove}
              onPlanReject={onPlanReject}
            />
        )}
      </div>

      {/* Commands dropdown */}
      <AnimatePresence>
        {showCommands && (
          <motion.div
            initial={{ opacity: 0, y: 4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 4, height: 0 }}
            className="mx-3 mb-1 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg overflow-hidden shadow-xl"
          >
            {COMMANDS.map((cmd) => (
              <button
                key={cmd.id}
                onClick={() => insertCommand(cmd)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-2)] transition-colors"
              >
                <span className="text-sm">{cmd.icon}</span>
                <span className="font-mono text-[11px] text-[var(--foreground)]">{cmd.label}</span>
                <span className="text-[10px] text-[var(--text-ghost)] ml-auto">{cmd.description}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* File suggestions dropdown */}
      <AnimatePresence>
        {showFileSuggest && filteredFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 4, height: 0 }}
            className="mx-3 mb-1 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg overflow-hidden shadow-xl"
          >
            {filteredFiles.map((file) => (
              <button
                key={file}
                onClick={() => insertFile(file)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--surface-2)] transition-colors"
              >
                <span className="font-mono text-[11px] text-[var(--foreground)]">{file}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {attachments.length > 0 && (
        <div className="mx-3 mb-1 flex flex-wrap gap-1.5 px-1">
          {attachments.map((f, i) => (
            <span
              key={`${f.name}-${f.size}-${i}`}
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
                className="grid size-5 place-items-center rounded hover:bg-[var(--forge-surface-2)] text-[var(--forge-silver)]"
                title="Remover anexo"
                onClick={() => removeAttachment(i)}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {(agentProgress?.pendingQueueCount ?? 0) > 0 && (
        <div
          className="forge-agent-bar lovable-agent-bar border-t border-[var(--forge-border)]"
          data-testid="pending-queue-hint"
        >
          <strong>{agentProgress!.pendingQueueCount}</strong> mensagem
          {agentProgress!.pendingQueueCount !== 1 ? "s" : ""} na fila — serão enviadas quando o
          agente liberar
        </div>
      )}

      <div className="forge-composer lovable-composer">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept={CHAT_ATTACHMENT_ACCEPT}
          onChange={handleFileChange}
        />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Ask FORGE…"
          rows={1}
          className="forge-composer-input"
        />

        <div className="forge-composer-row">
          <button
            type="button"
            className="forge-composer-icon"
            title="Anexar imagem ou documento (PDF, Word, Excel, TXT)"
            onClick={handleAttachClick}
          >
            <Paperclip className="size-4" />
          </button>

          {onVisualEdits && (
            <button
              type="button"
              className={`forge-composer-icon${visualEditsActive ? " !bg-[var(--forge-primary)]/15 !text-[var(--forge-primary)]" : ""}`}
              title="Visual edits — clique no preview para selecionar elemento"
              onClick={onVisualEdits}
            >
              <MousePointer2 className="size-4" />
            </button>
          )}

          <span className="forge-composer-spacer" />

          <ComposerModeSelect value={composerMode} onChange={setComposerMode} />

          <MicButton
            size="sm"
            className="forge-composer-mic"
            onTranscript={(t) => setInput((cur) => (cur ? `${cur} ${t}` : t))}
          />

          {running ? (
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
              onClick={handleSend}
              disabled={!input.trim() && attachments.length === 0}
              title="Enviar"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


