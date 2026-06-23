import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { X, Send, Globe, Loader2, ExternalLink, Paperclip, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useJobEvents, useJobPolling } from "./hooks";
import { JOB_STATUS_COLORS, type RealtimeEvent } from "./types";

interface BrowserPreviewPanelProps {
  jobId: string | null;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  actions?: Array<{ type: string; params: Record<string, unknown> }>;
}

interface JobContext {
  jobStatus: string;
  urls: string[];
  previewUrl: string | null;
  errors: string[];
  recentEvents: { type: string; payload: Record<string, unknown> }[];
  libraryEntries: { name: string; source_url: string; quality_score: number }[];
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled"]);

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return "agora";
  if (seconds < 60) return `${seconds}s atrás`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h atrás`;
}

const EVENT_LABELS: Record<string, { icon: string; label: string; dotColor: string }> = {
  url_extracting: { icon: "🌐", label: "Navegando", dotColor: "bg-blue-500" },
  page_loaded: { icon: "📄", label: "Página carregada", dotColor: "bg-green-500" },
  scrolling: { icon: "⬇️", label: "Scroll", dotColor: "bg-gray-500" },
  screenshot_taken: { icon: "📸", label: "Screenshot", dotColor: "bg-purple-500" },
  css_computed: { icon: "🎨", label: "CSS extraído", dotColor: "bg-green-500" },
  motion_traced: { icon: "✨", label: "Motion traces", dotColor: "bg-green-500" },
  llm_extracting: { icon: "🧠", label: "LLM extraindo DNA", dotColor: "bg-yellow-500" },
  url_extracted: { icon: "✅", label: "URL extraída", dotColor: "bg-green-500" },
  url_error: { icon: "❌", label: "Erro", dotColor: "bg-red-500" },
  job_completed: { icon: "🎉", label: "Job concluído", dotColor: "bg-amber-500" },
  job_failed: { icon: "💥", label: "Job falhou", dotColor: "bg-red-500" },
  sandbox_setup: { icon: "🔧", label: "Setup sandbox", dotColor: "bg-blue-500" },
  sandbox_ready: { icon: "✓", label: "Sandbox pronto", dotColor: "bg-green-500" },
};

function getEventConfig(eventType: string) {
  return EVENT_LABELS[eventType] ?? { icon: "•", label: eventType, dotColor: "bg-gray-500" };
}

function EventRow({ event, isLatest }: { event: RealtimeEvent; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const config = getEventConfig(event.event_type);
  const isLLM = event.event_type === "llm_extracting";

  const description = useMemo(() => {
    if (event.event_type === "url_extracting") {
      return `${config.label} → ${(event.payload?.url as string) ?? ""}`;
    }
    if (event.event_type === "url_extracted") {
      const count = event.payload?.resultsCount;
      return `${config.label} (${count ?? 0} resultados)`;
    }
    if (event.event_type === "url_error") {
      return `${config.label}: ${(event.payload?.error as string) ?? ""}`;
    }
    return config.label;
  }, [event, config.label]);

  return (
    <div
      className={`relative pl-7 pb-2.5 cursor-pointer transition-colors hover:bg-surface-2/50 rounded ${
        isLatest ? "opacity-100" : "opacity-70"
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div
        className={`absolute left-2 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-surface-1 ${
          config.dotColor
        } ${isLLM ? "animate-pulse" : ""}`}
      />
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground shrink-0">
          {formatRelativeTime(event.created_at)}
        </span>
        <span className="truncate">{description}</span>
      </div>
      {expanded && (
        <pre className="mt-1.5 text-[9px] font-mono text-muted-foreground bg-surface-2 rounded p-1.5 overflow-x-auto">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function BrowserPreviewPanel({ jobId, onClose }: BrowserPreviewPanelProps) {
  // Polling e realtime param quando job chega a estado terminal
  const { job, loading: jobLoading } = useJobPolling(jobId);
  const jobStatus = job?.status;
  const isTerminal = jobStatus ? TERMINAL_STATUSES.has(jobStatus) : false;

  const { events, connected } = useJobEvents(isTerminal ? null : jobId);
  const timelineRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [jobContext, setJobContext] = useState<JobContext | null>(null);
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
  const [cdpStatus, setCdpStatus] = useState<"checking" | "ok" | "failed">("checking");
  const [cdpMessage, setCdpMessage] = useState<string>("");

  const previewUrl = job?.meta?.previewUrl;
  const latestScreenshot = useMemo(() => {
    const shots = events.filter((e) => e.event_type === "screenshot_taken");
    return shots.length > 0 ? shots[shots.length - 1] : null;
  }, [events]);

  const currentUrlEvent = useMemo(() => {
    const extracting = events.filter((e) => e.event_type === "url_extracting");
    return extracting.length > 0 ? extracting[extracting.length - 1] : null;
  }, [events]);

  // Auto-scroll timeline
  useEffect(() => {
    if (autoScroll && timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // CDP health check: verifica se Chrome DevTools responde no previewUrl
  useEffect(() => {
    if (!previewUrl || isTerminal) {
      setCdpStatus("checking");
      return;
    }
    let cancelled = false;
    setCdpStatus("checking");
    fetch(`${previewUrl}/json/version`, { signal: AbortSignal.timeout(8000) })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) {
          const data = await r.json().catch(() => ({}));
          setCdpStatus("ok");
          setCdpMessage(data.Browser ?? "");
        } else {
          setCdpStatus("failed");
          setCdpMessage(`HTTP ${r.status}`);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setCdpStatus("failed");
        setCdpMessage(e instanceof Error ? e.message : "unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, [previewUrl, isTerminal]);

  const callChat = useCallback(
    async (message: string) => {
      if (!jobId) return;
      setChatLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("design-library-chat", {
          body: { jobId, message },
        });
        if (error) throw new Error(error.message);

        setSessionId((data.sessionId as string) ?? null);
        if (data.jobContext) setJobContext(data.jobContext as JobContext);

        const newMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: (data.reply as string) ?? "",
          timestamp: new Date().toISOString(),
          actions: data.actions as ChatMessage["actions"],
        };
        setChatMessages((prev) => {
          // Evita duplicar welcome (caso o histórico já tenha sido carregado depois)
          if (
            !message &&
            prev.length > 0 &&
            prev[prev.length - 1].role === "assistant" &&
            prev[prev.length - 1].content === newMsg.content
          ) {
            return prev;
          }
          return [...prev, newMsg];
        });
      } catch (err) {
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Erro: ${err instanceof Error ? err.message : "desconhecido"}`,
          timestamp: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, errorMsg]);
      } finally {
        setChatLoading(false);
      }
    },
    [jobId],
  );

  // Carrega histórico de chat e abre sessão (welcome message) na primeira vez
  const loadChatHistory = useCallback(async () => {
    if (!jobId) return;
    setChatHistoryLoaded(false);
    try {
      // 1) Carrega mensagens existentes do DB
      const { data: sessions } = await supabase
        .from("design_library_chat_sessions")
        .select("id")
        .eq("job_id", jobId)
        .maybeSingle();

      if (sessions) {
        setSessionId(sessions.id);
        const { data: msgs } = await supabase
          .from("design_library_chat_messages")
          .select("id, role, content, actions, created_at")
          .eq("session_id", sessions.id)
          .order("created_at", { ascending: true });
        setChatMessages(
          ((msgs ?? []) as Array<{
            id: string;
            role: string;
            content: string;
            actions: ChatMessage["actions"];
            created_at: string;
          }>).map((m) => ({
            id: m.id as string,
            role: m.role as "user" | "assistant",
            content: m.content as string,
            timestamp: m.created_at as string,
            actions: m.actions as ChatMessage["actions"],
          })),
        );
      } else {
        // Sem sessão ainda — chama chat com message vazia para criar e receber welcome
        await callChat("");
      }
    } catch (err) {
      console.error("loadChatHistory:", err);
    } finally {
      setChatHistoryLoaded(true);
    }
  }, [jobId, callChat]);

  useEffect(() => {
    if (jobId) {
      void loadChatHistory();
    }
  }, [jobId, loadChatHistory]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading || !jobId) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: chatInput,
      timestamp: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    await callChat(userMsg.content);
  }, [chatInput, chatLoading, jobId, callChat]);

  // Se o LLM retornou ações, mostra como chips visuais (placeholder para execução futura)
  const lastAssistantMsg = [...chatMessages]
    .reverse()
    .find((m) => m.role === "assistant" && m.actions && m.actions.length > 0);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-1">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Browser Preview</h2>
          {job && (
            <Badge
              variant="outline"
              className={`text-[10px] ${JOB_STATUS_COLORS[job.status] ?? ""}`}
            >
              {job.status}
            </Badge>
          )}
          {isTerminal && (
            <Badge
              variant="outline"
              className="text-[10px] bg-gray-500/10 text-gray-400 border-gray-500/30"
            >
              Encerrado
            </Badge>
          )}
          {!isTerminal && connected && (
            <span className="inline-flex items-center gap-1 text-[10px] text-green-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
          {!isTerminal && !connected && jobId && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />
              Offline
            </span>
          )}
          {previewUrl && !isTerminal && cdpStatus === "ok" && (
            <span className="inline-flex items-center gap-1 text-[10px] text-green-500">
              <Globe className="size-3" />
              CDP {cdpMessage ? `(${cdpMessage.split(" ")[0]})` : "ready"}
            </span>
          )}
          {previewUrl && !isTerminal && cdpStatus === "failed" && (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-amber-500"
              title={`Chrome DevTools não responde: ${cdpMessage}`}
            >
              <Globe className="size-3" />
              CDP offline
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {previewUrl && !isTerminal && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-primary hover:underline flex items-center gap-1"
            >
              Sandbox <ExternalLink className="size-3" />
            </a>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Preview Panel — fallback gracioso quando iframe não disponível */}
        <div className="flex-1 flex flex-col border-r border-border min-w-0">
          {previewUrl && !isTerminal && cdpStatus === "ok" ? (
            <iframe
              src={previewUrl}
              className="flex-1 w-full bg-white"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              title="Browser Preview"
            />
          ) : previewUrl && !isTerminal && cdpStatus === "failed" ? (
            <div className="flex-1 flex items-center justify-center bg-surface-2 p-6">
              <div className="text-center max-w-md">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-amber-500" />
                </div>
                <h3 className="text-sm font-medium mb-1">Sandbox sem Chrome DevTools</h3>
                <p className="text-[11px] text-muted-foreground mb-2">
                  O template E2B precisa ter Chromium rodando em :9222. Provavelmente você está
                  usando o template genérico (code-interpreter-v1) sem Chromium.
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  Para corrigir:{" "}
                  <code className="px-1 py-0.5 rounded bg-surface-3">
                    cd e2b-template && npm run build:prod
                  </code>{" "}
                  e defina{" "}
                  <code className="px-1 py-0.5 rounded bg-surface-3">
                    E2B_TEMPLATE=dreaming-doing-chromium
                  </code>
                  .
                </p>
                {latestScreenshot && (
                  <p className="text-[10px] text-amber-500 mt-3">
                    Último screenshot capturado abaixo ↓
                  </p>
                )}
              </div>
            </div>
          ) : latestScreenshot ? (
            <div className="flex-1 flex items-center justify-center bg-surface-2 p-4 overflow-auto">
              <div className="max-w-2xl w-full space-y-3">
                {events
                  .filter((e) => e.event_type === "screenshot_taken")
                  .slice(-3)
                  .reverse()
                  .map((ev, idx) => {
                    const url = (ev.payload?.url as string) ?? currentUrlEvent?.payload?.url ?? "";
                    return (
                      <div key={ev.id}>
                        <img
                          src={(ev.payload?.screenshot_url as string) ?? ""}
                          alt={`Screenshot ${idx + 1}`}
                          className="w-full rounded-lg border border-border"
                        />
                        {url && (
                          <p className="text-[10px] text-muted-foreground mt-1 truncate text-center">
                            {url}
                          </p>
                        )}
                      </div>
                    );
                  })}
                {isTerminal && (
                  <p className="text-[10px] text-amber-500 text-center pt-2 border-t border-border/50">
                    Sandbox E2B encerrado (job {jobStatus}). O iframe da sandbox E2B não fica
                    disponível externamente — o live preview depende de um serviço de browser
                    hospedado (ex: Browser-Use Cloud). Por ora, mostrando os últimos screenshots
                    capturados.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center p-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-surface-3 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {!jobId
                    ? "Selecione um job"
                    : isTerminal
                      ? `Job ${jobStatus}. ${jobContext?.errors?.[0] ?? "Sem screenshots capturados."}`
                      : "Aguardando sandbox..."}
                </p>
                {!isTerminal && (
                  <p className="text-[10px] text-muted-foreground/60 mt-2">
                    (Playwright ainda está configurando o Chromium — pode levar ~1 min)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Timeline at bottom */}
          <div className="border-t border-border bg-surface-1 max-h-[160px] flex flex-col">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
              <span className="text-[10px] font-medium">
                Timeline ({events.length})
                {isTerminal && <span className="text-muted-foreground ml-1">— encerrada</span>}
              </span>
              {!isTerminal && (
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                    autoScroll
                      ? "border-primary/30 text-primary bg-primary/10"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  Auto-scroll {autoScroll ? "ON" : "OFF"}
                </button>
              )}
            </div>
            <div ref={timelineRef} className="flex-1 overflow-y-auto px-3 py-1">
              {events.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[10px] text-muted-foreground">
                    {isTerminal ? "Sem eventos registrados" : "Aguardando eventos..."}
                  </p>
                </div>
              ) : (
                events.map((event, i) => (
                  <EventRow key={event.id} event={event} isLatest={i === events.length - 1} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Chat Panel — estilo Vibe Code via classes forge-composer */}
        <div className="w-[380px] flex flex-col bg-surface-1">
          <div ref={chatRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {!chatHistoryLoaded && (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {chatHistoryLoaded && chatMessages.length === 0 && !chatLoading && (
              <div className="text-center py-8">
                <p className="text-[11px] text-muted-foreground">Carregando conversa...</p>
              </div>
            )}
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] rounded-lg px-2.5 py-1.5 text-[11px] ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-foreground border border-border"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {msg.actions.map((a, i) => (
                        <span
                          key={i}
                          className="text-[9px] px-1.5 py-0.5 rounded border border-primary/30 text-primary bg-primary/10"
                        >
                          {a.type}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-surface-2 border border-border rounded-lg px-2.5 py-1.5">
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            {lastAssistantMsg && (
              <div className="text-[9px] text-muted-foreground/60 italic px-1">
                Ações do LLM serão executadas no sandbox quando o preview estiver ativo.
              </div>
            )}
          </div>

          {/* Composer — visual idêntico ao Vibe Code via forge-composer CSS */}
          <div className="border-t border-border p-2">
            <div className="forge-composer" data-testid="chat-composer">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendChat();
                  }
                }}
                placeholder={
                  isTerminal && chatMessages.length > 0
                    ? "Continuar conversa sobre o resultado..."
                    : "Pergunte sobre a extração ou peça uma ação no browser..."
                }
                className="forge-composer-input"
                rows={2}
                disabled={chatLoading || !jobId}
              />
              <div className="forge-composer-row">
                <div className="forge-composer-row-start">
                  <button
                    type="button"
                    className="forge-composer-add"
                    title="Anexar"
                    aria-label="Anexar"
                    onClick={() => {
                      /* placeholder para anexos futuros */
                    }}
                  >
                    <Paperclip className="size-4" />
                  </button>
                </div>
                <span className="forge-composer-spacer" aria-hidden />
                <div className="forge-composer-row-end">
                  {chatLoading && (
                    <button
                      type="button"
                      className="forge-composer-stop"
                      title="Parar"
                      aria-label="Parar"
                      onClick={() => {
                        /* sem cancel stream no MVP */
                      }}
                    >
                      <Square className="size-3.5 fill-current" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="forge-composer-send"
                    onClick={() => void handleSendChat()}
                    disabled={!chatInput.trim() || chatLoading || !jobId}
                    title="Enviar"
                    aria-label="Enviar"
                  >
                    <Send className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
