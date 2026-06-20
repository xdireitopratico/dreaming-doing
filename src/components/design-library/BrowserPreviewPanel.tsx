import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { X, Send, Globe, Loader2, ExternalLink } from "lucide-react";
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
}

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
  url_extracting: { icon: "🌐", label: "Navegando para", dotColor: "bg-blue-500" },
  page_loaded: { icon: "📄", label: "Página carregada", dotColor: "bg-green-500" },
  scrolling: { icon: "⬇️", label: "Scroll", dotColor: "bg-gray-500" },
  screenshot_taken: { icon: "📸", label: "Screenshot capturado", dotColor: "bg-purple-500" },
  css_computed: { icon: "🎨", label: "CSS computado extraído", dotColor: "bg-green-500" },
  motion_traced: { icon: "✨", label: "Motion traces extraídos", dotColor: "bg-green-500" },
  llm_extracting: { icon: "🧠", label: "LLM extraindo DesignDNA", dotColor: "bg-yellow-500" },
  url_extracted: { icon: "✅", label: "Extração concluída", dotColor: "bg-green-500" },
  url_error: { icon: "❌", label: "Erro", dotColor: "bg-red-500" },
  job_completed: { icon: "🎉", label: "Job concluído!", dotColor: "bg-amber-500" },
  job_failed: { icon: "💥", label: "Job falhou", dotColor: "bg-red-500" },
  sandbox_setup: { icon: "🔧", label: "Configurando sandbox", dotColor: "bg-blue-500" },
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
      return `${config.label} ${(event.payload?.url as string) ?? ""}`;
    }
    if (event.event_type === "scrolling") {
      const x = event.payload?.scroll_x ?? "?";
      const y = event.payload?.scroll_y ?? "?";
      return `${config.label} ${x}/${y}`;
    }
    if (event.event_type === "url_error") {
      return `${config.label} ${(event.payload?.message as string) ?? ""}`;
    }
    if (event.event_type === "url_extracted") {
      return `${config.label}: ${(event.payload?.url as string) ?? ""}`;
    }
    return config.label;
  }, [event, config.label]);

  return (
    <div
      className={`relative pl-7 pb-2.5 cursor-pointer transition-colors hover:bg-surface-2/50 rounded ${isLatest ? "opacity-100" : "opacity-70"}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div
        className={`absolute left-2 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-surface-1 ${config.dotColor} ${isLLM ? "animate-pulse" : ""}`}
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
  const { events, connected } = useJobEvents(jobId);
  const { job } = useJobPolling(jobId);
  const timelineRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const previewUrl = job?.meta?.previewUrl;
  const isRunning = job?.status === "running" || job?.status === "pending";

  const latestScreenshot = useMemo(() => {
    const screenshots = events.filter((e) => e.event_type === "screenshot_taken");
    if (screenshots.length === 0) return null;
    return screenshots[screenshots.length - 1];
  }, [events]);

  const currentUrlEvent = useMemo(() => {
    const extracting = events.filter((e) => e.event_type === "url_extracting");
    if (extracting.length === 0) return null;
    return extracting[extracting.length - 1];
  }, [events]);

  useEffect(() => {
    if (autoScroll && timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendChat = async () => {
    if (!chatInput.trim() || !jobId) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: chatInput,
      timestamp: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("design-library-chat", {
        body: {
          jobId,
          message: userMsg.content,
          context: {
            previewUrl,
            currentUrl: currentUrlEvent?.payload?.url,
            jobStatus: job?.status,
          },
        },
      });

      if (error) throw new Error(error.message ?? "Erro desconhecido");

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data?.reply ?? "Sem resposta",
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
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
  };

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
          {connected && (
            <span className="inline-flex items-center gap-1 text-[10px] text-green-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
          {!connected && jobId && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />
              Offline
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {previewUrl && (
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
        {/* Iframe Panel */}
        <div className="flex-1 flex flex-col border-r border-border">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              className="flex-1 w-full bg-white"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              title="Browser Preview"
            />
          ) : latestScreenshot ? (
            <div className="flex-1 flex items-center justify-center bg-surface-2 p-4">
              <div className="max-w-2xl w-full">
                <img
                  src={(latestScreenshot.payload?.screenshot_url as string) ?? ""}
                  alt="Screenshot"
                  className="w-full rounded-lg border border-border"
                />
                {currentUrlEvent && (
                  <p className="text-[10px] text-muted-foreground mt-2 truncate text-center">
                    {currentUrlEvent.payload?.url as string}
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
                  {isRunning ? "Aguardando sandbox..." : "Nenhum preview disponível"}
                </p>
              </div>
            </div>
          )}

          {/* Timeline at bottom */}
          <div className="border-t border-border bg-surface-1 max-h-[140px] flex flex-col">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
              <span className="text-[10px] font-medium">Timeline ({events.length})</span>
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
            </div>
            <div ref={timelineRef} className="flex-1 overflow-y-auto px-3 py-1">
              {events.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[10px] text-muted-foreground">Aguardando eventos...</p>
                </div>
              ) : (
                events.map((event, i) => (
                  <EventRow key={event.id} event={event} isLatest={i === events.length - 1} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Chat Panel */}
        <div className="w-[360px] flex flex-col bg-surface-1">
          <div className="px-3 py-2 border-b border-border">
            <h3 className="text-xs font-medium">Chat com LLM</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Converse sobre a extração ou peça ações no browser
            </p>
          </div>

          <div ref={chatRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatMessages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-[11px] text-muted-foreground">
                  Nenhuma mensagem. Comece a conversar!
                </p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Ex: "Analise o hero" ou "Tire um screenshot da seção de features"
                </p>
              </div>
            )}
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px] ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-foreground border border-border"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
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
          </div>

          <div className="p-2 border-t border-border">
            <div className="flex gap-1.5">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
                placeholder="Pergunte ou peça uma ação..."
                className="min-h-[60px] max-h-[120px] text-[11px] resize-none"
                disabled={chatLoading || !jobId}
              />
              <Button
                onClick={handleSendChat}
                disabled={!chatInput.trim() || chatLoading || !jobId}
                size="sm"
                className="h-auto px-2"
              >
                <Send className="size-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
