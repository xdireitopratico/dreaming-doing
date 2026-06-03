import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EditorShell } from "@/components/EditorShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowUp, Loader2, Sparkles, Code2, Eye } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$projectId")({
  component: EditorPage,
});

type Msg = { id: string; role: string; parts: any[]; tool_calls: any[]; created_at: string };
type FileRow = { id: string; path: string; content: string; updated_at: string };

function EditorPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const qc = useQueryClient();
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).single();
      if (error) throw error;
      return data;
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
      return (data ?? []) as Msg[];
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

  // Realtime updates for messages + files
  useEffect(() => {
    if (!conversation) return;
    const ch = supabase
      .channel(`editor-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        () => qc.invalidateQueries({ queryKey: ["messages", conversation.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "project_files", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["files", projectId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, conversation, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages?.length]);

  // Auto-run agent if last message is from user and we're idle
  const lastUserOnly = useMemo(() => {
    if (!messages || messages.length === 0) return false;
    return messages[messages.length - 1].role === "user";
  }, [messages]);

  useEffect(() => {
    if (lastUserOnly && conversation && !running) runAgent();
     
  }, [lastUserOnly, conversation?.id]);

  const runAgent = async () => {
    if (!conversation || running) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("agent-run", {
        body: { projectId, conversationId: conversation.id },
      });
      if (error) throw error;
      if (data?.error) toast.error(data.error);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro no agente");
    } finally {
      setRunning(false);
    }
  };

  const send = async () => {
    if (!input.trim() || !conversation) return;
    const text = input;
    setInput("");
    await supabase.from("messages").insert({
      conversation_id: conversation.id, role: "user", parts: [{ type: "text", text }],
    });
  };

  const previewSrc = useMemo(() => {
    const index = files?.find((f) => f.path === "index.html" || f.path === "/index.html");
    if (!index) return "";
    return index.content;
  }, [files]);

  return (
    <EditorShell
      projectName={project?.name}
      right={
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
              <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--primary)]">
                <Loader2 className="size-3 animate-spin" /> FORGING
              </span>
            )}
          </div>
          <ScrollArea className="flex-1" ref={scrollRef as any}>
            <div className="p-4 space-y-5">
              {(messages ?? []).length === 0 && !running && (
                <div className="text-sm text-[var(--text-ghost)] italic">
                  Aguardando o primeiro prompt…
                </div>
              )}
              {(messages ?? []).map((m) => {
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={isUser ? "pl-6" : "pr-6"}>
                    <div className="font-mono text-[10px] tracking-[0.3em] uppercase mb-1.5 inline-flex items-center gap-1.5 text-[var(--text-ghost)]">
                      {!isUser && <Sparkles className="size-3 text-[var(--primary)]" />}
                      {isUser ? "YOU" : "FORGE"}
                    </div>
                    <div
                      className={`rounded-lg p-3 text-sm leading-relaxed ${
                        isUser
                          ? "bg-[var(--primary)]/10 border border-[var(--primary)]/30 text-foreground"
                          : "bg-[var(--surface-2)]/70 border border-[var(--border)] text-foreground"
                      }`}
                    >
                      {m.parts?.map((p: any, i: number) =>
                        p.type === "text" ? (
                          <div key={i} className="whitespace-pre-wrap">{p.text}</div>
                        ) : null,
                      )}
                      {m.tool_calls && m.tool_calls.length > 0 && (
                        <div className="mt-2.5 space-y-1">
                          {m.tool_calls.map((t: any, i: number) => (
                            <div
                              key={i}
                              className="text-[11px] font-mono px-2 py-1 rounded bg-background/60 border border-[var(--border)] text-[var(--text-dim)]"
                            >
                              <span className="text-[var(--primary)]">▸</span> {t.name}
                              <span className="text-[var(--text-ghost)]">({t.args?.path ?? ""})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
                className="min-h-20 resize-none pr-12 bg-[var(--surface-2)]/80 border-[var(--border)] focus-visible:ring-[var(--primary)]/40"
              />
              <Button
                size="icon"
                className="absolute right-2 bottom-2 size-8 bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90"
                onClick={send}
                disabled={!input.trim() || running}
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
            <div className="mt-2 font-mono text-[9px] tracking-[0.25em] uppercase text-[var(--text-ghost)]">
              ⏎ ENTER TO SEND · ⇧⏎ NEW LINE
            </div>
          </div>
        </aside>

        {/* Preview / Code */}
        <div className="flex-1 min-w-0 bg-background relative">
          {tab === "preview" ? (
            previewSrc ? (
              <div className="absolute inset-3 rounded-lg overflow-hidden border border-[var(--border)] shadow-[0_0_60px_-20px_rgba(255,182,39,0.25)]">
                <iframe
                  title="preview"
                  srcDoc={previewSrc}
                  sandbox="allow-scripts"
                  className="w-full h-full bg-white"
                />
              </div>
            ) : (
              <div className="h-full grid place-items-center">
                <div className="text-center">
                  <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-[var(--text-ghost)] mb-3">
                    · STANDING BY ·
                  </div>
                  <div className="text-sm text-[var(--text-dim)]">
                    {running
                      ? "Compilando seu universo…"
                      : "O preview aparecerá aqui assim que o primeiro arquivo for criado."}
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="h-full flex">
              <div className="w-64 border-r border-[var(--border)] p-2 overflow-auto bg-[var(--surface-1)]/40">
                <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--text-ghost)] px-2 py-1.5">
                  FILES
                </div>
                {(files ?? []).map((f) => (
                  <div
                    key={f.id}
                    className="px-2 py-1 text-sm rounded hover:bg-[var(--surface-2)] cursor-default font-mono truncate text-[var(--text-dim)]"
                  >
                    {f.path}
                  </div>
                ))}
              </div>
              <div className="flex-1 overflow-auto p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--text-dim)]">
                  {files?.map((f) => `// ${f.path}\n${f.content}\n\n`).join("")}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </EditorShell>
  );
}
