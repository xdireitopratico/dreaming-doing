import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ArrowUp, Loader2, Sparkles, Code2, Eye } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$projectId")({
  component: () => <RequireAuth><EditorPage /></RequireAuth>,
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

  // Auto-run agent if there's a pending user message and no assistant reply yet
  const lastUserOnly = useMemo(() => {
    if (!messages || messages.length === 0) return false;
    const last = messages[messages.length - 1];
    return last.role === "user";
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
    <div className="h-screen flex flex-col bg-background">
      <header className="h-12 border-b flex items-center px-4 gap-3 shrink-0">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="size-4 text-primary shrink-0" />
          <span className="font-medium truncate">{project?.name ?? "Carregando…"}</span>
        </div>
        <div className="ml-auto flex items-center gap-1 border rounded-md p-0.5">
          <Button size="sm" variant={tab === "preview" ? "default" : "ghost"} onClick={() => setTab("preview")}>
            <Eye className="size-3.5 mr-1" /> Preview
          </Button>
          <Button size="sm" variant={tab === "code" ? "default" : "ghost"} onClick={() => setTab("code")}>
            <Code2 className="size-3.5 mr-1" /> Código
          </Button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Chat panel */}
        <div className="w-[380px] border-r flex flex-col min-h-0">
          <ScrollArea className="flex-1" ref={scrollRef as any}>
            <div className="p-4 space-y-4">
              {(messages ?? []).map((m) => (
                <div key={m.id} className={m.role === "user" ? "ml-6" : "mr-6"}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    {m.role === "user" ? "Você" : "Lovable AI"}
                  </div>
                  <div className={`rounded-lg p-3 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                    {m.parts?.map((p: any, i: number) => p.type === "text" ? <div key={i} className="whitespace-pre-wrap">{p.text}</div> : null)}
                    {m.tool_calls && m.tool_calls.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {m.tool_calls.map((t: any, i: number) => (
                          <div key={i} className="text-xs font-mono px-2 py-1 rounded bg-muted text-muted-foreground">
                            🔧 {t.name}({t.args?.path ?? ""})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {running && (
                <div className="mr-6 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> gerando…
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="border-t p-3">
            <div className="relative">
              <Textarea
                value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
                placeholder="Peça mudanças…" className="min-h-20 resize-none pr-12"
              />
              <Button size="icon" className="absolute right-2 bottom-2 size-8" onClick={send} disabled={!input.trim() || running}>
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Preview / Code */}
        <div className="flex-1 min-w-0 bg-muted/30">
          {tab === "preview" ? (
            previewSrc ? (
              <iframe title="preview" srcDoc={previewSrc} sandbox="allow-scripts" className="w-full h-full bg-white" />
            ) : (
              <div className="h-full grid place-items-center text-muted-foreground text-sm">
                {running ? "Gerando seu app…" : "Preview aparecerá aqui assim que index.html for criado."}
              </div>
            )
          ) : (
            <div className="h-full flex">
              <div className="w-64 border-r p-2 overflow-auto">
                <div className="text-xs font-medium text-muted-foreground px-2 py-1">Arquivos</div>
                {(files ?? []).map((f) => (
                  <div key={f.id} className="px-2 py-1 text-sm rounded hover:bg-accent cursor-default font-mono truncate">
                    {f.path}
                  </div>
                ))}
              </div>
              <div className="flex-1 overflow-auto p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {files?.map((f) => `// ${f.path}\n${f.content}\n\n`).join("")}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
