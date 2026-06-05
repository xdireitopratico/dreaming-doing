// ChatInput.tsx — Input aprimorado com /commands, @file autocomplete, markdown render, auto-resize
// Botão de parar visível durante execução, drag de imagens, typewriter nas respostas
import { useState, useRef, useCallback, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Square,
  FileText,
  Paperclip,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MicButton } from "@/components/voice/MicButton";
import { toast } from "sonner";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import {
  getAgentSetupBlockMessage,
  isAgentPreferencesConfigured,
} from "@/lib/agent-setup";

export type AgentComposerMode = "build" | "plan";

// -----------------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{ name: string; args: string }>;
  timestamp: number;
}

interface ChatInputProps {
  messages: ChatMessage[];
  running: boolean;
  onSend: (text: string, mode?: AgentComposerMode) => void;
  onStop: () => void;
  files: string[];
  composerMode?: AgentComposerMode;
  onComposerModeChange?: (mode: AgentComposerMode) => void;
  externalPrompt?: string | null;
  onExternalPromptConsumed?: () => void;
  /** Markdown exibido quando não há mensagens (boas-vindas / tira-gosto). */
  welcomeMarkdown?: string;
  tasteChatRemaining?: number;
  tasteStartRemaining?: number;
  onStartProject?: () => void;
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
// Markdown renderer customizado com tokens do design system
// -----------------------------------------------------------------------------------

function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="prose prose-invert max-w-none text-sm leading-relaxed 
      prose-headings:font-display prose-headings:tracking-tight
      prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
      prose-p:text-[var(--text-dim)]
      prose-code:font-mono prose-code:text-[11px] prose-code:bg-[var(--surface-2)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
      prose-pre:bg-[var(--surface-1)] prose-pre:border prose-pre:border-[var(--border)] prose-pre:rounded-lg
      prose-ul:text-[var(--text-dim)] prose-ol:text-[var(--text-dim)]
      prose-li:my-0.5
      prose-a:text-[var(--primary)] prose-a:no-underline hover:prose-a:underline
      prose-strong:text-[var(--foreground)]
      prose-blockquote:border-l-[var(--primary)] prose-blockquote:text-[var(--text-dim)]
      prose-hr:border-[var(--border)]
      prose-table:border-[var(--border)] prose-th:border-[var(--border)] prose-td:border-[var(--border)]
      [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[11px]
      [&_pre]:text-[var(--foreground)]
      [&_input]:bg-[var(--surface-2)] [&_input]:text-[var(--foreground)]
    ">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

// -----------------------------------------------------------------------------------
// Typewriter effect for streaming assistant messages
// -----------------------------------------------------------------------------------

function TypewriterText({ text, speed = 8 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed("");

    if (text.length === 0) return;

    const interval = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  if (!text) return null;

  return <MarkdownContent>{displayed}</MarkdownContent>;
}

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
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [composerModeLocal, setComposerModeLocal] = useState<AgentComposerMode>("build");
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
  }, [messages]);

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

  const handleSend = () => {
    const text = input.trim();
    if (!text || running) return;

    const prefs = loadAgentPreferences();
    if (!isAgentPreferencesConfigured(prefs)) {
      toast.error(getAgentSetupBlockMessage(prefs));
      return;
    }

    historyRef.current.push(text);
    setHistoryIndex(-1);
    setInput("");
    if (attachments.length > 0) {
      toast.info(`${attachments.length} anexo(s) — envio multimodal em breve`);
      setAttachments([]);
    }
    onSend(text, composerMode);
  };

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length) setAttachments((prev) => [...prev, ...picked].slice(0, 8));
    e.target.value = "";
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
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length) setAttachments((prev) => [...prev, ...dropped].slice(0, 8));
  };

  return (
    <div className="forge-chat-inner" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      <div ref={scrollRef} className="forge-messages">
        {messages.length === 0 ? (
          <div className="forge-msg-text space-y-3">
            {welcomeMarkdown ? (
              <MarkdownContent>{welcomeMarkdown}</MarkdownContent>
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
          messages.map((msg) => (
            <div key={msg.id} className="mb-4 last:mb-0">
              {msg.role === "user" ? (
                <p className="forge-msg-text forge-msg-user">{msg.content}</p>
              ) : (
                <div className="forge-msg-text">
                  {messages[messages.length - 1]?.id === msg.id && running ? (
                    <TypewriterText text={msg.content} />
                  ) : (
                    <MarkdownContent>{msg.content}</MarkdownContent>
                  )}
                </div>
              )}

              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="forge-tool-inline">
                  <div className="forge-tool-inline-title">
                    <FileText className="size-4 text-[var(--forge-primary)]" />
                    <span className="truncate">
                      {msg.toolCalls[0]?.name}
                      {msg.toolCalls[0]?.args ? `: ${msg.toolCalls[0].args.slice(0, 48)}` : ""}
                    </span>
                  </div>
                  <div className="forge-tool-inline-actions">
                    <button type="button" className="forge-tool-btn">
                      Details
                    </button>
                    <button type="button" className="forge-tool-btn">
                      Preview
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
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
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--forge-border)] bg-[var(--forge-surface-3)] px-2 py-0.5 text-[10px] text-[var(--forge-muted)]"
            >
              {f.type.startsWith("image/") ? (
                <ImageIcon className="size-3" />
              ) : (
                <FileText className="size-3" />
              )}
              <span className="max-w-[120px] truncate">{f.name}</span>
            </span>
          ))}
        </div>
      )}

      <div className="forge-composer">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.md,.json"
          onChange={handleFileChange}
        />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask FORGE…"
          rows={1}
          className="forge-composer-input"
        />

        <div className="forge-composer-row">
          <button
            type="button"
            className="forge-composer-icon"
            title="Anexar imagem ou documento"
            onClick={handleAttachClick}
          >
            <Paperclip className="size-4" />
          </button>

          <span className="forge-composer-spacer" />

          <div className="forge-mode-toggle" role="group" aria-label="Modo do agente">
            <button
              type="button"
              data-active={composerMode === "build"}
              onClick={() => setComposerMode("build")}
            >
              Build
            </button>
            <button
              type="button"
              data-active={composerMode === "plan"}
              onClick={() => setComposerMode("plan")}
            >
              Plan
            </button>
          </div>

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
              disabled={!input.trim()}
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


