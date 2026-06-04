import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EditorShell } from "@/components/EditorShell";
import { MicButton } from "@/components/voice/MicButton";
import { SnapshotsSheet } from "@/components/editor/SnapshotsSheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowUp, Loader2, Sparkles, Code2, Eye, RefreshCw, Square,
  CheckCircle2, XCircle, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { streamAgentRun, type AgentEvent } from "@/lib/agent-stream";

export const Route = createFileRoute("/projects/$projectId")({
  component: EditorPage,
});

type ToolCallRow = { id?: string; name: string; args?: any; status?: string; error?: string | null };
type Msg = { id: string; role: string; parts: any[]; tool_calls: ToolCallRow[]; created_at: string };
type FileRow = { id: string; path: string; content: string; updated_at: string };

type Project = {
  id: string; name: string; meta: { previewUrl?: string; previewExpiresAt?: string } | null;
};

function EditorPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const qc = useQueryClient();
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState("");
  const [liveEvents, setLiveEvents] = useState<AgentEvent[]>([]);
  const [bootingPreview, setBootingPreview] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const { data: project } = useQuery<Project | null>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, meta")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data as Project;
    },
  });

  const { data: conversation } = useQuery({
    queryKey: ["conversation", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations").select("*").eq("project_id", projectId)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["messages", conversation?.id],
    queryFn: async () => {
      if (!conversation) return [];
      const { data, error } = await supabase
        .from("messages").select("*").eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Msg[];
    },
    enabled: !!conversation,
  });

  const { data: files } = useQuery({
    queryKey: ["files", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_files").select("*").eq("project_id", projectId).order("path");
      if (error) throw error;
      return (data ?? []) as FileRow[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!conversation) return;
    const ch = supabase
      .channel(`editor-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        () => qc.invalidateQueries({ queryKey: ["messages", conversation.id] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_files", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["files", projectId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, conversation, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages?.length, liveEvents.length]);

  // Auto-run agent quando a última mensagem é do user e estamos idle
  const lastIsUser = useMemo(() => {
    if (!messages || messages.length === 0) return false;
    return messages[messages.length - 1].role === "user";
  }, [messages]);

  useEffect(() => {
    if (lastIsUser && conversation && !running) {
      runAgent();
    }
     
  }, [lastIsUser, conversation?.id]);

  async function runAgent() {
    if (!conversation || running) return;
    setRunning(true);
    setLiveEvents([]);
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      await streamAgentRun(
        { projectId, conversationId: conversation.id, signal: ac.signal },
        (ev) => {
          setLiveEvents((prev) => [...prev, ev]);
          if (ev.type === "finish" || ev.type === "done" || ev.type === "error") {
            qc.invalidateQueries({ queryKey: ["messages", conversation.id] });
            qc.invalidateQueries({ queryKey: ["files", projectId] });
          }
        },
      );
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast.error(e?.message ?? "Erro no agente");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
      // Boot preview se ainda não existe
      if (!project?.meta?.previewUrl) {
        bootPreview();
      }
    }
  }

  function stopAgent() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    toast.info("Agente interrompido");
  }

  async function send() {
    if (!input.trim() || !conversation) return;
    const text = input;
    setInput("");
    await supabase.from("messages").insert({
      conversation_id: conversation.id, role: "user", parts: [{ type: "text", text }],
    });
  }

  async function bootPreview(force = false) {
    setBootingPreview(true);
    try {
      const { data, error } = await supabase.functions.invoke("preview-boot", {
        body: { projectId, force },
      });
      if (error) throw new Error(error.message);
      const res = data as { url?: string; error?: string; reused?: boolean };
      if (res.error) throw new Error(res.error);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      if (!res.reused) toast.success("Preview ligado");
    } catch (e: any) {
      toast.error(`Preview: ${e?.message ?? "falhou"}`);
    } finally {
      setBootingPreview(false);
    }
  }

  const previewUrl = project?.meta?.previewUrl ?? "";
  const previewExpired = useMemo(() => {
    const exp = project?.meta?.previewExpiresAt;
    if (!exp) return true;
    return new Date(exp).getTime() < Date.now();
  }, [project?.meta?.previewExpiresAt]);

  const selectedFileContent = useMemo(() => {
    if (!files) return null;
    const path = selectedFile ?? files.find((f) => f.path === "src/App.tsx")?.path ?? files[0]?.path;
    if (!path) return null;
    const f = files.find((x) => x.path === path);
    return f ? { path: f.path, content: f.content } : null;
  }, [files, selectedFile]);

  return (
    <EditorShell
      projectName={project?.name}
      right={
        <>
          <SnapshotsSheet projectId={projectId} />
          {tab === "preview" && (
            <button
              onClick={() => bootPreview(true)}
              disabled={bootingPreview}
              aria-label="Recarregar preview"
              className="size-8 grid place-items-center rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-foreground transition-colors disabled:opacity-50"
            >
              {bootingPreview ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </button>
          )}
          <div className="flex items-center gap-1 border border-[var(--border)] rounded-md p-0.5 bg-[var(--surface-1)]/60 backdrop-blur">
            <button
              onClick={() => setTab("preview")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono tracking-[0.2em] uppercase transition-colors ${
                tab === "preview"
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--text-dim)] hover:text-foreground"
              }`}
            >
              <Eye className="size-3" /> Preview
            </button>
            <button
              onClick={() => setTab("code")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono tracking-[0.2em] uppercase transition-colors ${
                tab === "code"
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--text-dim)] hover:text-foreground"
              }`}
            >
              <Code2 className="size-3" /> Code
            </button>
          </div>
        </>
      }
    >
      <div className="h-full flex min-h-0">
        {/* Chat panel */}
        <aside className="w-[400px] border-r border-[var(--border)] flex flex-col min-h-0 bg-[var(--surface-1)]/40 backdrop-blur-xl">
          <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--text-ghost)]">
              · MISSION CONTROL ·
            </span>
            {running && (
              <button
                onClick={stopAgent}
                className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-red-400 hover:text-red-300 transition-colors"
              >
                <Square className="size-2.5 fill-current" /> STOP
              </button>
            )}
          </div>

          <ScrollArea className="flex-1" ref={scrollRef as any}>
            <div className="p-4 space-y-5">
              {(messages ?? []).length === 0 && !running && (
                <div className="text-sm text-[var(--text-ghost)] italic">
                  Aguardando o primeiro prompt…
                </div>
              )}

              {(messages ?? []).map((m) => (
                <MessageBubble key={m.id} m={m} />
              ))}

              {running && liveEvents.length > 0 && <LiveTrace events={liveEvents} />}
            </div>
          </ScrollArea>

          <div className="border-t border-[var(--border)] p-3 bg-background/60">
            <div className="relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Peça uma mudança…"
                className="min-h-20 resize-none pr-24 bg-[var(--surface-2)]/80 border-[var(--border)] focus-visible:ring-[var(--primary)]/40"
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
                <MicButton size="sm" onTranscript={(t) => setInput((cur) => (cur ? `${cur} ${t}` : t))} />
                <Button
                  size="icon"
                  className="size-8 bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90"
                  onClick={send}
                  disabled={!input.trim() || running}
                >
                  <ArrowUp className="size-4" />
                </Button>
              </div>
            </div>
            <div className="mt-2 font-mono text-[9px] tracking-[0.25em] uppercase text-[var(--text-ghost)]">
              ⏎ ENTER · ⇧⏎ NOVA LINHA · 🎙️ VOZ
            </div>
          </div>
        </aside>

        {/* Preview / Code */}
        <div className="flex-1 min-w-0 bg-background relative">
          {tab === "preview" ? (
            <PreviewPanel
              url={previewUrl}
              expired={previewExpired}
              booting={bootingPreview}
              onBoot={() => bootPreview(true)}
            />
          ) : (
            <CodePanel
              files={files ?? []}
              selected={selectedFileContent}
              onSelect={(p) => setSelectedFile(p)}
            />
          )}
        </div>
      </div>
    </EditorShell>
  );
}

// ─── Message bubble com tool_calls colapsáveis ───
function MessageBubble({ m }: { m: Msg }) {
  const isUser = m.role === "user";
  const text = (m.parts ?? []).map((p: any) => p.type === "text" ? p.text : "").join("\n").trim();

  return (
    <div className={isUser ? "pl-6" : "pr-6"}>
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase mb-1.5 inline-flex items-center gap-1.5 text-[var(--text-ghost)]">
        {!isUser && <Sparkles className="size-3 text-[var(--primary)]" />}
        {isUser ? "VOCÊ" : "FORGE"}
      </div>
      <div
        className={`rounded-lg p-3 text-sm leading-relaxed ${
          isUser
            ? "bg-[var(--primary)]/10 border border-[var(--primary)]/30 text-foreground"
            : "bg-[var(--surface-2)]/70 border border-[var(--border)] text-foreground"
        }`}
      >
        {text && <div className="whitespace-pre-wrap">{text}</div>}
        {m.tool_calls && m.tool_calls.length > 0 && (
          <div className={`${text ? "mt-2.5" : ""} space-y-1`}>
            {m.tool_calls.map((t, i) => {
              const path = t.args?.path ?? t.args?.pattern ?? t.args?.command?.slice(0, 50) ?? "";
              const ok = t.status === "ok";
              const err = t.status === "error";
              const running = !t.status || t.status === "running";
              const Icon = ok ? CheckCircle2 : err ? XCircle : Loader2;
              const color = ok ? "text-emerald-400" : err ? "text-red-400" : "text-[var(--primary)]";
              return (
                <div
                  key={t.id ?? i}
                  className="text-[11px] font-mono px-2 py-1 rounded bg-background/60 border border-[var(--border)] text-[var(--text-dim)] flex items-center gap-2"
                  title={t.error ?? ""}
                >
                  <Icon className={`size-3 ${color} ${running ? "animate-spin" : ""}`} />
                  <span className="text-[var(--primary)]">{t.name}</span>
                  {path && <span className="text-[var(--text-ghost)] truncate">{String(path)}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Live trace do stream SSE enquanto o agente roda ───
function LiveTrace({ events }: { events: AgentEvent[] }) {
  const items = useMemo(() => {
    const out: { key: string; text: string; status: "info" | "ok" | "err" | "running" }[] = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      switch (ev.type) {
        case "phase":
          out.push({ key: `p-${i}`, text: ev.data.message ?? ev.data.phase, status: "info" });
          break;
        case "classify":
          out.push({ key: `c-${i}`, text: `${ev.data.model} · ${ev.data.summary}`, status: "info" });
          break;
        case "tool_start":
          out.push({ key: `ts-${i}`, text: `→ ${ev.data.name} ${tinyArgs(ev.data.args)}`, status: "running" });
          break;
        case "tool_done":
          out.push({ key: `td-${i}`, text: `${ev.data.ok ? "✓" : "✗"} ${ev.data.name}${ev.data.error ? ` · ${ev.data.error.slice(0, 80)}` : ""}`, status: ev.data.ok ? "ok" : "err" });
          break;
        case "validate_fail":
          out.push({ key: `vf-${i}`, text: `Build falhou — tentativa ${ev.data.attempt}`, status: "err" });
          break;
        case "validate_ok":
          out.push({ key: `vo-${i}`, text: ev.data.message, status: "ok" });
          break;
        case "error":
          out.push({ key: `e-${i}`, text: ev.error ?? ev.data?.message ?? "erro", status: "err" });
          break;
      }
    }
    return out;
  }, [events]);

  return (
    <div className="pr-6">
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase mb-1.5 inline-flex items-center gap-1.5 text-[var(--text-ghost)]">
        <Loader2 className="size-3 text-[var(--primary)] animate-spin" />
        FORGE · TRABALHANDO
      </div>
      <div className="rounded-lg p-3 bg-[var(--surface-2)]/70 border border-[var(--border)] space-y-1">
        {items.map((it) => (
          <div
            key={it.key}
            className={`text-[11px] font-mono flex items-start gap-2 ${
              it.status === "ok" ? "text-emerald-400"
              : it.status === "err" ? "text-red-400"
              : it.status === "running" ? "text-[var(--primary)]"
              : "text-[var(--text-dim)]"
            }`}
          >
            <ChevronRight className="size-3 mt-0.5 shrink-0 opacity-60" />
            <span className="truncate">{it.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function tinyArgs(args: any): string {
  if (!args || typeof args !== "object") return "";
  const v = args.path ?? args.pattern ?? args.command ?? "";
  return String(v).slice(0, 60);
}

// ─── Preview panel: iframe pra URL E2B ───
function PreviewPanel({
  url, expired, booting, onBoot,
}: {
  url: string; expired: boolean; booting: boolean; onBoot: () => void;
}) {
  if (booting) {
    return (
      <div className="h-full grid place-items-center">
        <div className="text-center space-y-3">
          <Loader2 className="size-6 mx-auto text-[var(--primary)] animate-spin" />
          <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-[var(--text-ghost)]">
            · BOOTANDO SANDBOX ·
          </div>
          <div className="text-sm text-[var(--text-dim)] max-w-xs">
            Instalando dependências e subindo o dev server…
            <br /><span className="text-[var(--text-ghost)]">~30s</span>
          </div>
        </div>
      </div>
    );
  }

  if (!url || expired) {
    return (
      <div className="h-full grid place-items-center">
        <div className="text-center space-y-4">
          <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-[var(--text-ghost)]">
            · STANDING BY ·
          </div>
          <div className="text-sm text-[var(--text-dim)] max-w-xs">
            {expired
              ? "Sandbox expirou. Suba de novo pra ver as últimas mudanças."
              : "Suba o sandbox pra ver o preview rodando ao vivo."}
          </div>
          <Button onClick={onBoot} className="gap-2">
            <RefreshCw className="size-4" /> Ligar preview
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-3 rounded-lg overflow-hidden border border-[var(--border)] shadow-[0_0_60px_-20px_rgba(255,182,39,0.25)] bg-white">
      <iframe
        title="preview"
        src={url}
        className="w-full h-full"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />
    </div>
  );
}

// ─── Code panel: file tree + viewer ───
function CodePanel({
  files, selected, onSelect,
}: {
  files: FileRow[];
  selected: { path: string; content: string } | null;
  onSelect: (path: string) => void;
}) {
  return (
    <div className="h-full flex">
      <div className="w-64 border-r border-[var(--border)] overflow-auto bg-[var(--surface-1)]/40 shrink-0">
        <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--text-ghost)] px-3 py-2 border-b border-[var(--border)] sticky top-0 bg-[var(--surface-1)]">
          FILES · {files.length}
        </div>
        <div className="py-1">
          {files.map((f) => (
            <button
              key={f.id}
              onClick={() => onSelect(f.path)}
              className={`w-full text-left px-3 py-1 text-xs font-mono truncate transition-colors ${
                selected?.path === f.path
                  ? "bg-[var(--primary)]/10 text-foreground"
                  : "text-[var(--text-dim)] hover:bg-[var(--surface-2)]/60 hover:text-foreground"
              }`}
            >
              {f.path}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {selected ? (
          <div>
            <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-[var(--border)] px-4 py-2 font-mono text-[11px] text-[var(--text-dim)]">
              {selected.path}
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap p-4 text-[var(--text-dim)] leading-relaxed">
              {selected.content}
            </pre>
          </div>
        ) : (
          <div className="h-full grid place-items-center text-[var(--text-ghost)] text-sm">
            Selecione um arquivo
          </div>
        )}
      </div>
    </div>
  );
}
