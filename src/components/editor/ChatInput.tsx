// ChatInput.tsx — Input aprimorado com /commands, @file autocomplete, markdown render, auto-resize
// Botão de parar visível durante execução, drag de imagens, typewriter nas respostas
import { useState, useRef, useCallback, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Square, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

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
  onSend: (text: string) => void;
  onStop: () => void;
  files: string[];
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
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [showFileSuggest, setShowFileSuggest] = useState(false);
  const [filteredFiles, setFilteredFiles] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<string[]>([]);

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

    historyRef.current.push(text);
    setHistoryIndex(-1);
    setInput("");
    onSend(text);
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

  // Drag and drop images
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    // TODO: image upload + paste
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--surface-1)]/40">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="size-12 rounded-full bg-[var(--surface-2)] border border-[var(--border)] grid place-items-center">
              <Sparkles className="size-5 text-[var(--primary)] opacity-50" />
            </div>
            <div>
              <p className="text-sm text-[var(--text-dim)] font-display">
                Pronto para construir
              </p>
              <p className="text-[10px] font-mono text-[var(--text-ghost)] mt-1">
                Descreva sua ideia. O agente cuida do resto.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex gap-2 max-w-[90%]",
                msg.role === "user" ? "ml-auto" : "mr-auto",
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  "shrink-0 size-6 rounded-md grid place-items-center mt-0.5",
                  msg.role === "user"
                    ? "order-2 bg-[var(--primary)]/10 border border-[var(--primary)]/20"
                    : "bg-[var(--surface-2)] border border-[var(--border)]",
                )}
              >
                {msg.role === "user" ? (
                  <span className="text-[10px] font-mono text-[var(--primary)]">U</span>
                ) : (
                  <span className="text-[10px] font-mono text-[var(--text-dim)]">AI</span>
                )}
              </div>

              {/* Bubble */}
              <div
                className={cn(
                  "rounded-lg px-3 py-2",
                  msg.role === "user"
                    ? "bg-[var(--primary)]/10 border border-[var(--primary)]/20 text-right"
                    : "bg-[var(--surface-2)]/70 border border-[var(--border)]",
                )}
              >
                {msg.role === "assistant" && messages[messages.length - 1]?.id === msg.id && running ? (
                  <TypewriterText text={msg.content} />
                ) : (
                  <MarkdownContent>{msg.content}</MarkdownContent>
                )}

                {/* Tool calls inline */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {msg.toolCalls.map((tc, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-dim)]"
                      >
                        <Wrench className="size-2.5 text-[var(--primary)]" />
                        <span className="text-[var(--foreground)]">{tc.name}</span>
                        <span className="text-[var(--text-ghost)] truncate">{tc.args.slice(0, 40)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
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

      {/* Input area */}
      <div className="shrink-0 border-t border-[var(--border)] p-3 bg-[var(--background)]/60 backdrop-blur-xl">
        <div className="relative" onDrop={handleDrop}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Descreva o que construir..."
            rows={1}
            className="w-full resize-none rounded-lg bg-[var(--surface-2)]/80 border border-[var(--border)] focus:border-[var(--primary)]/40 focus:ring-1 focus:ring-[var(--primary)]/20 px-3 py-2.5 pr-12 text-sm font-body text-[var(--foreground)] placeholder:text-[var(--text-ghost)] outline-none transition-colors"
          />

          {/* Send / Stop button */}
          {running ? (
            <button
              onClick={onStop}
              className="absolute right-2 bottom-2 size-8 rounded-md bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/90 transition-colors grid place-items-center"
              title="Parar agente"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={cn(
                "absolute right-2 bottom-2 size-8 rounded-md grid place-items-center transition-all",
                input.trim()
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hot)]"
                  : "bg-[var(--surface-2)] text-[var(--text-ghost)] cursor-not-allowed",
              )}
              title="Enviar"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>

        {/* Hint bar */}
        <div className="flex items-center justify-between mt-1.5 px-1">
          <div className="flex items-center gap-3 text-[9px] font-mono text-[var(--text-ghost)]">
            <span>⏎ enviar</span>
            <span>⇧⏎ nova linha</span>
            <span>↑↓ histórico</span>
            <span>/ comandos</span>
            <span>@ arquivos</span>
          </div>
          <span className="text-[9px] font-mono text-[var(--text-ghost)]">
            {input.length > 0 ? `${input.length} caracteres` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

function Wrench({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
