import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  X,
  Send,
  Globe,
  Loader2,
  ExternalLink,
  Paperclip,
  Square,
  StopCircle,
  Play,
  MousePointer,
  Eye,
  Type,
  Camera,
  ArrowDown,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useJobEvents, useJobPolling } from "./hooks";
import { cancelExtractionJob, postInstruction } from "./api";
import { JOB_STATUS_COLORS, JOB_TERMINAL_STATUSES, type RealtimeEvent } from "./types";
import { toast } from "@/lib/toast";
import { getSupabaseEnv } from "@/lib/supabase-env";

// ── Types ────────────────────────────────────────────────────────────

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

interface ThinkingState {
  active: boolean;
  model?: string;
  label?: string;
  elapsed: number;
}

// ── Constants ────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Focar no hero", content: "Foca no hero e ignora o resto da página por enquanto." },
  { label: "Capturar motion", content: "Prioriza capturar animações, transições e motion traces." },
  { label: "Mais tipografia", content: "Aprofunda a análise de tipografia e hierarquia de texto." },
  { label: "Sintetizar agora", content: "Você já tem evidências suficientes. Sintetize o Design DNA final." },
];

const TERMINAL_STATUSES = new Set<string>(JOB_TERMINAL_STATUSES);

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
  preview_server_ready: { icon: "🖼️", label: "Preview pronto", dotColor: "bg-green-500" },
  chrome_cdp_ready: { icon: "🌐", label: "Chrome CDP pronto", dotColor: "bg-green-500" },
  quality_error: { icon: "⚠️", label: "Qualidade baixa", dotColor: "bg-amber-500" },
  validation_error: { icon: "⚠️", label: "Campos faltando", dotColor: "bg-amber-500" },
};

function getEventConfig(eventType: string) {
  return EVENT_LABELS[eventType] ?? { icon: "•", label: eventType, dotColor: "bg-gray-500" };
}

/** Build the Supabase Function URL for direct fetch (needed for SSE). */
function getFunctionUrl(name: string): string {
  const { url } = getSupabaseEnv();
  return `${url}/functions/v1/${name}`;
}

/** Get current auth token for direct fetch calls. */
async function getAuthToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// ── Action Icons ─────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, React.ReactNode> = {
  navigate: <Globe className="size-3" />,
  screenshot: <Camera className="size-3" />,
  scroll: <ArrowDown className="size-3" />,
  click: <MousePointer className="size-3" />,
  analyze: <Eye className="size-3" />,
  type: <Type className="size-3" />,
  evaluate: <ArrowRight className="size-3" />,
};

function getAgentEventDescription(event: RealtimeEvent): string {
  const payload = event.payload ?? {};
  switch (event.event_type) {
    case "agent_thought":
      return `💭 ${payload.thought ?? ""}`;
    case "agent_action":
      return `⚡ ${(payload.action as { type: string })?.type ?? ""}`;
    case "agent_observation":
      return `👁 ${(payload.observation as { type: string })?.type ?? ""}`;
    case "agent_done":
      return `✅ Agente concluiu`;
    case "agent_error":
      return `❌ Erro: ${payload.error ?? ""}`;
    default:
      return getEventConfig(event.event_type).label;
  }
}

// ── EventRow ─────────────────────────────────────────────────────────

function EventRow({ event, isLatest }: { event: RealtimeEvent; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const config = getEventConfig(event.event_type);
  const isLLM = event.event_type === "llm_extracting";
  const isAgent = event.event_type.startsWith("agent_");

  const description = useMemo(() => {
    if (isAgent) {
      return getAgentEventDescription(event);
    }
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
  }, [event, config.label, isAgent]);

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

// ── Thinking Indicator ────────────────────────────────────────────────

function ThinkingIndicator({ thinking }: { thinking: ThinkingState }) {
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const [elapsed, setElapsed] = useState(thinking.elapsed);

  useEffect(() => {
    if (thinking.active) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [thinking.active]);

  if (!thinking.active) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="forge-chat-thought-line flex items-center gap-2 px-2 py-1.5">
      <div className="flex gap-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      <span className="text-[11px] text-muted-foreground">
        Thinking{thinking.label ? ` (${thinking.label})` : ""}...
        <span className="ml-1 text-[10px] tabular-nums">{mins}:{String(secs).padStart(2, "0")}</span>
      </span>
    </div>
  );
}

// ── ActionChip ────────────────────────────────────────────────────────

function ActionChip({
  action,
  onExecute,
  disabled,
}: {
  action: { type: string; params: Record<string, unknown> };
  onExecute: (action: { type: string; params: Record<string, unknown> }) => void;
  disabled: boolean;
}) {
  const [executing, setExecuting] = useState(false);

  const handleClick = async () => {
    setExecuting(true);
    try {
      await onExecute(action);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || executing}
      className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-primary/30 text-primary bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {executing ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        ACTION_ICONS[action.type] ?? <Play className="size-3" />
      )}
      <span>{action.type}</span>
      {action.params?.url && (
        <span className="text-[9px] text-muted-foreground truncate max-w-[120px]">
          {String(action.params.url)}
        </span>
      )}
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function BrowserPreviewPanel({ jobId, onClose }: BrowserPreviewPanelProps) {
  // ── Job state ─────────────────────────────────────────────────────
  const { job, loading: jobLoading } = useJobPolling(jobId);
  const jobStatus = job?.status;
  const isTerminal = jobStatus ? TERMINAL_STATUSES.has(jobStatus) : false;
  const { events, connected } = useJobEvents(isTerminal ? null : jobId);
  const timelineRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // ── Chat state ───────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [jobContext, setJobContext] = useState<JobContext | null>(null);
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // ── Thinking + streaming state ────────────────────────────────────
  const [thinking, setThinking] = useState<ThinkingState>({ active: false, elapsed: 0 });
  const [streamingContent, setStreamingContent] = useState("");

  // ── Preview state ───────────────────────────────────────────────
  const previewUrl = job?.meta?.previewUrl as string | undefined;
  const progress = job?.meta?.progress as number | undefined;

  // ── Action execution ────────────────────────────────────────────
  const executeAction = useCallback(
    async (action: { type: string; params: Record<string, unknown> }) => {
      if (!jobId) return;
      try {
        const token = await getAuthToken();
        if (!token) throw new Error("Not authenticated");

        const res = await fetch(getFunctionUrl("design-library-actions"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ jobId, action: action.type, params: action.params }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Action failed");

        toast.success(`${action.type} executado`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao executar ação");
      }
    },
    [jobId],
  );

  // ── Computed ─────────────────────────────────────────────────────
  const currentUrlEvent = useMemo(() => {
    const extracting = events.filter((e) => e.event_type === "url_extracting");
    return extracting.length > 0 ? extracting[extracting.length - 1] : null;
  }, [events]);

  const lastSandboxSetup = useMemo(() => {
    const setup = events.filter((e) => e.event_type === "sandbox_setup");
    return setup.length > 0 ? setup[setup.length - 1] : null;
  }, [events]);

  const sandboxStep = lastSandboxSetup?.payload?.step as string | undefined;

  const SANDBOX_STEP_LABELS: Record<string, string> = {
    creating: "Criando sandbox E2B...",
    connecting: "Conectando ao sandbox...",
    "waiting-runtime": "Aguardando runtime do sandbox...",
    "installing-playwright": "Instalando Chromium (~2min)...",
  };

  const hasReadyEvent = useMemo(() => events.some((e) => e.event_type === "sandbox_ready"), [events]);
  const hasLLMEvent = useMemo(() => events.some((e) => e.event_type === "llm_extracting"), [events]);

  const statusMessage = useMemo(() => {
    if (!jobId) return "Selecione um job";
    if (isTerminal) return `Job ${jobStatus}.`;
    if (sandboxStep && SANDBOX_STEP_LABELS[sandboxStep]) return SANDBOX_STEP_LABELS[sandboxStep];
    if (events.some((e) => e.event_type === "chrome_cdp_ready"))
      return "Chrome CDP pronto — aguardando extração...";
    if (events.some((e) => e.event_type === "preview_server_ready"))
      return "Preview pronto — aguardando Chrome...";
    if (hasLLMEvent && progress) return `LLM extraindo DNA... ${progress}%`;
    if (progress !== undefined && progress > 0 && progress < 100) {
      const ue = currentUrlEvent;
      if (ue)
        return `Processando ${ue.payload?.url ?? ""} (${ue.payload?.index ?? 0}/${ue.payload?.total ?? 0})`;
      return `Extraindo design... ${progress}%`;
    }
    if (hasReadyEvent) return "Sandbox pronto — iniciando serviços...";
    return "Aguardando sandbox...";
  }, [
    jobId,
    isTerminal,
    sandboxStep,
    SANDBOX_STEP_LABELS,
    hasLLMEvent,
    progress,
    currentUrlEvent,
    hasReadyEvent,
    jobStatus,
    events,
  ]);

  // ── Auto-scroll timeline ─────────────────────────────────────────
  useEffect(() => {
    if (autoScroll && timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // ── SSE Chat with streaming ──────────────────────────────────────
  const callChatSSE = useCallback(
    async (message: string) => {
      if (!jobId) return;
      setChatLoading(true);
      setStreamingContent("");
      setThinking({ active: true, elapsed: 0 });

      try {
        const token = await getAuthToken();
        if (!token) throw new Error("Not authenticated");

        const res = await fetch(getFunctionUrl("design-library-chat"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ jobId, message, stream: true }),
        });

        if (!res.ok) {
          // Fallback to JSON for non-streaming responses (e.g., welcome message)
          if (res.headers.get("content-type")?.includes("application/json")) {
            const data = await res.json();
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }
          throw new Error(`HTTP ${res.status}`);
        }

        // Check if it's SSE or JSON response
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          // JSON fallback (welcome messages, etc.)
          const data = await res.json();
          setThinking({ active: false, elapsed: 0 });
          setSessionId((data.sessionId as string) ?? null);
          if (data.jobContext) setJobContext(data.jobContext as JobContext);

          const newMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: (data.reply as string) ?? "",
            timestamp: new Date().toISOString(),
            actions: data.actions as ChatMessage["actions"],
          };
          setChatMessages((prev) => [...prev, newMsg]);
          return;
        }

        // SSE stream
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let fullContent = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let eventType = "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("event: ")) {
              eventType = trimmed.slice(7).trim();
            } else if (trimmed.startsWith("data: ")) {
              try {
                const data = JSON.parse(trimmed.slice(6));

                switch (eventType) {
                  case "thinking":
                    if (data.started) {
                      setThinking((prev) => ({
                        ...prev,
                        active: true,
                        model: data.model,
                        label: data.label,
                      }));
                    }
                    if (data.stopped) {
                      setThinking({ active: false, elapsed: 0 });
                    }
                    break;

                  case "delta":
                    fullContent += data.content ?? "";
                    setStreamingContent(fullContent);
                    break;

                  case "actions":
                    // Actions will be attached to the final message
                    break;

                  case "done":
                    setThinking({ active: false, elapsed: 0 });
                    setStreamingContent("");

                    // Final message with accumulated content
                    const reply = data.reply ?? fullContent;
                    const finalMsg: ChatMessage = {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      content: reply,
                      timestamp: new Date().toISOString(),
                      actions: data.actions
                        ? (data.actions as ChatMessage["actions"])
                        : undefined,
                    };
                    setChatMessages((prev) => [...prev, finalMsg]);

                    if (data.sessionId) setSessionId(data.sessionId as string);
                    if (data.jobContext) setJobContext(data.jobContext as JobContext);
                    break;

                  case "error":
                    setThinking({ active: false, elapsed: 0 });
                    setStreamingContent("");
                    const errMsg: ChatMessage = {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      content: `⚠️ Erro: ${data.message ?? "desconhecido"}`,
                      timestamp: new Date().toISOString(),
                    };
                    setChatMessages((prev) => [...prev, errMsg]);
                    break;
                }
              } catch {
                // Skip malformed SSE data
              }
              eventType = "";
            }
          }
        }
      } catch (err) {
        setThinking({ active: false, elapsed: 0 });
        setStreamingContent("");
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

  // ── Load chat history on mount ───────────────────────────────────
  const loadChatHistory = useCallback(async () => {
    if (!jobId) return;
    setChatHistoryLoaded(false);
    try {
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
        await callChatSSE("");
      }
    } catch (err) {
      console.error("loadChatHistory:", err);
    } finally {
      setChatHistoryLoaded(true);
    }
  }, [jobId, callChatSSE]);

  useEffect(() => {
    if (jobId) void loadChatHistory();
  }, [jobId, loadChatHistory]);

  // ── Auto-scroll chat ─────────────────────────────────────────────
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages, streamingContent]);

  // ── Send message ────────────────────────────────────────────────
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

    // If job is running, send as instruction to the agent loop
    if (!isTerminal) {
      try {
        await postInstruction(jobId, userMsg.content, "user");
        return;
      } catch (err) {
        console.error("[BrowserPreviewPanel] postInstruction failed:", err);
        toast.error(err instanceof Error ? err.message : "Erro ao enviar instrução");
      }
    }

    // Fallback: traditional SSE chat
    await callChatSSE(userMsg.content);
  }, [chatInput, chatLoading, jobId, isTerminal, callChatSSE]);

  const handleSendChatWithText = useCallback(
    async (text: string) => {
      setChatInput(text);
      await handleSendChat();
    },
    [handleSendChat],
  );

  // ── Cancel job ───────────────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    if (!jobId || cancelling) return;
    setCancelling(true);
    try {
      await cancelExtractionJob(jobId);
      toast.success("Extração cancelada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar");
    } finally {
      setCancelling(false);
    }
  }, [jobId, cancelling]);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-1">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Reality Show</h2>
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
          {!isTerminal && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={cancelling}
              className="h-7 text-[11px] border-red-500/30 text-red-500 hover:bg-red-500/10"
            >
              {cancelling ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <StopCircle className="size-3.5 mr-1" />
              )}
              Cancelar
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {progress !== undefined && progress > 0 && progress < 100 && (
        <div className="h-1 bg-surface-3">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Main content: iframe + chat */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Preview Panel — LIVE IFRAME (mandatory, zero fallback) ── */}
        <div className="flex-1 flex flex-col border-r border-border min-w-0">
          {previewUrl ? (
            <iframe
              ref={iframeRef}
              src={previewUrl}
              title="E2B Sandbox Preview"
              className="flex-1 w-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              loading="eager"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-surface-2">
              <div className="text-center p-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-surface-3 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {!jobId
                    ? "Selecione um job"
                    : isTerminal
                      ? `Job ${jobStatus}. Sandbox encerrado.`
                      : statusMessage}
                </p>
              </div>
            </div>
          )}

          {/* Timeline */}
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

        {/* ── Chat Panel — SSE streaming + clickable actions ── */}
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
                  {/* Clickable LLM action chips */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.actions.map((a, i) => (
                        <ActionChip
                          key={`${a.type}-${i}`}
                          action={a}
                          onExecute={executeAction}
                          disabled={!previewUrl || isTerminal}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Streaming content (shows while LLM is generating) */}
            {streamingContent && (
              <div className="flex justify-start">
                <div className="max-w-[90%] rounded-lg px-2.5 py-1.5 text-[11px] bg-surface-2 text-foreground border border-primary/20">
                  <p className="whitespace-pre-wrap">{streamingContent}</p>
                  <span className="inline-block w-1.5 h-3 bg-primary/60 animate-pulse ml-0.5" />
                </div>
              </div>
            )}

            {/* Thinking indicator */}
            <ThinkingIndicator thinking={thinking} />

            {/* Loading fallback (no thinking yet) */}
            {chatLoading && !thinking.active && !streamingContent && (
              <div className="flex justify-start">
                <div className="bg-surface-2 border border-border rounded-lg px-2.5 py-1.5">
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Quick actions */}
          {!isTerminal && (
            <div className="border-t border-border/50 px-3 py-2 flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => void handleSendChatWithText(a.content)}
                  className="text-[9px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-surface-2 transition-colors"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {/* Quick actions */}
          {!isTerminal && (
            <div className="border-t border-border/50 px-3 py-2 flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => void handleSendChatWithText(a.content)}
                  className="text-[9px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-surface-2 transition-colors"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
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
                        // Abort controller could be used here in future
                        setChatLoading(false);
                        setThinking({ active: false, elapsed: 0 });
                        setStreamingContent("");
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
