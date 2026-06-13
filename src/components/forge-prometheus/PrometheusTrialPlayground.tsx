/**
 * PrometheusTrialPlayground — Live chat to test trial agents directly after build
 * ROADMAP-03 Phase 5: Integrated playground that calls aetherforge-gateway with action:test
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Send, Loader2, RotateCcw, MessageSquare, Bot, User, AlertTriangle, FlaskConical } from "lucide-react";
import "./prometheus-studio.css";

interface PlaygroundMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  latencyMs?: number;
  error?: boolean;
}

interface Props {
  flowId: string;
  agentName?: string;
}

export function PrometheusTrialPlayground({ flowId, agentName }: Props) {
  const [messages, setMessages] = useState<PlaygroundMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: PlaygroundMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setError(null);

    const start = Date.now();

    try {
      const { data, error: fnError } = await supabase.functions.invoke("aetherforge-gateway", {
        body: {
          action: "test",
          flow_id: flowId,
          message: text,
          session_id: sessionId,
          channel: "playground",
        },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const latencyMs = Date.now() - start;
      const reply = data?.reply || data?.steps?.slice(-1)?.[0]?.output?.content || "Sem resposta";

      const assistantMsg: PlaygroundMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: typeof reply === "string" ? reply : JSON.stringify(reply),
        timestamp: Date.now(),
        latencyMs,
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const msg = (err as Error).message || "Erro desconhecido";
      let userMsg = msg;
      if (msg.includes("MODEL_NOT_CONFIGURED") || msg.includes("missing_credentials")) {
        userMsg = "Configure as credenciais do modelo LLM antes de testar. Acesse Configurações → Chaves API.";
      }
      setError(userMsg);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: userMsg,
        timestamp: Date.now(),
        error: true,
      }]);
    }

    setIsLoading(false);
    inputRef.current?.focus();
  }, [input, isLoading, flowId, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ps-border)" }}>
      
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--ps-border)", background: "rgba(255,255,255,0.03)" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }}>
            <FlaskConical className="h-3.5 w-3.5" style={{ color: "hsl(38 92% 50%)" }} />
          </div>
          <div>
            <span className="text-[11px] font-semibold" style={{ color: "var(--ps-cream)" }}>
              Playground Trial
            </span>
            {agentName && (
              <span className="text-[9px] ml-1.5 px-1.5 py-0.5 rounded"
                style={{ background: "rgba(245,158,11,0.1)", color: "hsl(38 92% 50%)" }}>
                {agentName}
              </span>
            )}
          </div>
        </div>
        <button onClick={resetChat}
          className="p-1.5 rounded-lg transition-colors hover:opacity-80"
          style={{ background: "rgba(255,255,255,0.05)" }}>
          <RotateCcw className="h-3.5 w-3.5" style={{ color: "var(--ps-cream-40)" }} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
            <MessageSquare className="h-8 w-8" style={{ color: "var(--ps-cream-25)" }} />
            <div className="text-center">
              <p className="text-[12px] font-medium" style={{ color: "var(--ps-cream-60)" }}>
                Teste seu agente em modo Trial
              </p>
              <p className="text-[10px] mt-1" style={{ color: "var(--ps-cream-25)" }}>
                Envie uma mensagem para ver como ele responde
              </p>
            </div>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                  style={{ background: msg.error ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)" }}>
                  {msg.error ? (
                    <AlertTriangle className="h-3 w-3" style={{ color: "hsl(0 70% 65%)" }} />
                  ) : (
                    <Bot className="h-3 w-3" style={{ color: "var(--ps-accent)" }} />
                  )}
                </div>
              )}
              <div className="max-w-[80%] px-3 py-2 rounded-xl"
                style={{
                  background: msg.role === "user"
                    ? "rgba(59,130,246,0.15)"
                    : msg.error
                      ? "rgba(239,68,68,0.08)"
                      : "rgba(255,255,255,0.04)",
                  border: `1px solid ${
                    msg.role === "user"
                      ? "rgba(59,130,246,0.2)"
                      : msg.error
                        ? "rgba(239,68,68,0.2)"
                        : "var(--ps-border)"
                  }`,
                }}>
                <p className="text-[11px] leading-relaxed whitespace-pre-wrap"
                  style={{ color: msg.error ? "hsl(0 70% 65%)" : "var(--ps-cream-80)" }}>
                  {msg.content}
                </p>
                {msg.latencyMs && (
                  <span className="text-[8px] mt-1 block" style={{ color: "var(--ps-cream-25)" }}>
                    {msg.latencyMs}ms
                  </span>
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                  style={{ background: "rgba(59,130,246,0.15)" }}>
                  <User className="h-3 w-3" style={{ color: "var(--ps-accent)" }} />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ background: "rgba(59,130,246,0.15)" }}>
              <Bot className="h-3 w-3" style={{ color: "var(--ps-accent)" }} />
            </div>
            <div className="flex gap-1 px-3 py-2 rounded-xl"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--ps-border)" }}>
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "var(--ps-accent)", animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 py-3" style={{ borderTop: "1px solid var(--ps-border)" }}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem para testar..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 rounded-lg text-[11px] outline-none placeholder-opacity-50"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--ps-border)",
              color: "var(--ps-cream)",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="p-2 rounded-lg transition-all disabled:opacity-30"
            style={{ background: "var(--ps-accent)", color: "#000" }}
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
