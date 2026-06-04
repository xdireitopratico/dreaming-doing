// $projectId.tsx — Editor FORGE (Refatorado v3)
// Layout 30/70 split com divisor arrastável, todos os componentes integrados
// Design system da home aplicado em cada elemento
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Group, Panel, Separator } from "react-resizable-panels";
import { supabase } from "@/integrations/supabase/client";
import { EditorShell } from "@/components/EditorShell";
import { CodeEditor, type Tab } from "@/components/editor/CodeEditor";
import { FileTree } from "@/components/editor/FileTree";
import { ChatInput, type ChatMessage } from "@/components/editor/ChatInput";
import { AgentPanel } from "@/components/editor/AgentPanel";
import { PreviewFrame } from "@/components/editor/PreviewFrame";
import { StatusBar } from "@/components/editor/StatusBar";
import { useSSE } from "@/hooks/useSSE";
import { Code2, Eye, PanelLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MicButton } from "@/components/voice/MicButton";

export const Route = createFileRoute("/projects/$projectId")({
  component: EditorPage,
});

// ---------------------------------------------------------------------------
// Tipos locais
// ---------------------------------------------------------------------------

type Msg = {
  id: string; role: string; parts: any[]; tool_calls: any[];
  created_at: string;
};
type FileRow = {
  id: string; path: string; content: string; updated_at: string;
};

// ---------------------------------------------------------------------------
// Editor Page
// ---------------------------------------------------------------------------

function EditorPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const qc = useQueryClient();

  const [showFileTree, setShowFileTree] = useState(true);
  const [activeView, setActiveView] = useState<"code" | "preview">("code");
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<Tab[]>([]);
  const [running, setRunning] = useState(false);

  const sse = useSSE();

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*").eq("id", projectId).single();
      return data as any;
    },
  });

  const { data: conversation } = useQuery({
    queryKey: ["conversation", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations").select("*").eq("project_id", projectId)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      return data;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["messages", conversation?.id],
    queryFn: async () => {
      if (!conversation) return [];
      const { data } = await supabase
        .from("messages").select("*").eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });
      return (data ?? []) as Msg[];
    },
    enabled: !!conversation,
  });

  const { data: files } = useQuery({
    queryKey: ["files", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_files").select("*").eq("project_id", projectId).order("path");
      return (data ?? []) as FileRow[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!conversation) return;
    const ch = supabase
      .channel(`editor-${projectId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "messages",
        filter: `conversation_id=eq.${conversation.id}`,
      }, () => qc.invalidateQueries({ queryKey: ["messages", conversation.id] }))
      .on("postgres_changes", {
        event: "*", schema: "public", table: "project_files",
        filter: `project_id=eq.${projectId}`,
      }, () => qc.invalidateQueries({ queryKey: ["files", projectId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, conversation, qc]);

  // Derivados
  const filePaths = useMemo(() => files?.map((f) => f.path) ?? [], [files]);
  const fileMap = useMemo(() => {
    const map = new Map<string, string>();
    files?.forEach((f) => map.set(f.path, f.content ?? ""));
    return map;
  }, [files]);

  const chatMessages: ChatMessage[] = useMemo(() => {
    return (messages ?? []).map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant" | "tool",
      content: m.parts?.map((p: any) => p.text).join("\n") ?? "",
      toolCalls: m.tool_calls?.map((t: any) => ({ name: t.name, args: t.args?.path ?? "" })) ?? [],
      timestamp: new Date(m.created_at).getTime(),
    }));
  }, [messages]);

  // Handlers
  const handleSelectFile = useCallback((path: string) => {
    setActiveFilePath(path);
    setActiveView("code");
    setOpenTabs((prev) => {
      if (prev.some((t) => t.path === path)) return prev;
      return [...prev, { path, content: fileMap.get(path) ?? "", isModified: false }];
    });
  }, [fileMap]);

  const handleCloseTab = useCallback((path: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.path !== path);
      if (activeFilePath === path) {
        setActiveFilePath(next.length > 0 ? next[next.length - 1].path : null);
      }
      return next;
    });
  }, [activeFilePath]);

  const handleContentChange = useCallback((path: string, content: string) => {
    setOpenTabs((prev) =>
      prev.map((t) => t.path === path ? { ...t, content, isModified: true } : t),
    );
  }, []);

  const runAgent = useCallback(() => {
    if (!conversation || running) return;
    setRunning(true);
    try {
      sse.connect(projectId, conversation.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao iniciar agente");
      setRunning(false);
    }
  }, [conversation, projectId, running, sse]);

  const handleSend = useCallback((text: string) => {
    if (!conversation) return;
    supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      parts: [{ type: "text", text }],
    }).then(({ error }) => {
      if (error) toast.error("Erro ao enviar mensagem");
      else runAgent();
    });
  }, [conversation, runAgent]);

  const handleStop = useCallback(() => {
    sse.disconnect();
    setRunning(false);
    toast.info("Agente interrompido");
  }, [sse]);

  const handleCreateFile = useCallback((parentPath: string) => {
    toast.info("Criar arquivo — via chat com o agente: 'Crie um arquivo X'");
  }, []);

  const handleCreateFolder = useCallback((parentPath: string) => {
    toast.info("Criar pasta — via chat com o agente: 'Crie a pasta X'");
  }, []);

  const handleRename = useCallback((oldPath: string, newPath: string) => {
    toast.info(`Renomear: ${oldPath} → ${newPath}`);
  }, []);

  const handleDelete = useCallback((path: string) => {
    toast.info(`Deletar: ${path}`);
  }, []);

  // Syncing running state with SSE
  useEffect(() => {
    if (!sse.connected && running) {
      setRunning(false);
    }
    if (sse.connected && !running) {
      setRunning(true);
    }
  }, [sse.connected]);

  // File tree — uses real files if they exist, otherwise shows template structure
  const fileTreeFiles = useMemo(() => {
    if (files && files.length > 0) return files.map(f => f.path);
    return [
      "src/App.tsx", "src/main.tsx", "src/index.css",
      "package.json", "index.html", "vite.config.ts", "tsconfig.json",
    ];
  }, [files]);

  return (
    <EditorShell
      projectName={project?.name}
      right={
        <div className="flex items-center gap-1">
          {/* File Tree toggle */}
          <button
            onClick={() => setShowFileTree((v) => !v)}
            className={`p-1.5 rounded-md transition-colors ${
              showFileTree
                ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                : "text-[var(--text-ghost)] hover:text-[var(--text-dim)]"
            }`}
            title="Explorer"
          >
            <PanelLeft className="size-3.5" />
          </button>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 border border-[var(--border)] rounded-md p-0.5 bg-[var(--surface-1)]/60">
            <button
              onClick={() => setActiveView("code")}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                activeView === "code"
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--text-dim)] hover:text-[var(--foreground)]"
              }`}
            >
              <Code2 className="size-3" /> Code
            </button>
            <button
              onClick={() => setActiveView("preview")}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                activeView === "preview"
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--text-dim)] hover:text-[var(--foreground)]"
              }`}
            >
              <Eye className="size-3" /> Preview
            </button>
          </div>

          {/* Mic button */}
          <MicButton onTranscript={(t) => {
            if (t.trim()) handleSend(t);
          }} />

          {running && (
            <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em] uppercase text-[var(--primary)]">
              <Loader2 className="size-3 animate-spin" />
              FORGING
            </span>
          )}
        </div>
      }
    >
      <Group orientation="horizontal" className="h-full">
        {/* LEFT: Chat + AgentPanel */}
        <Panel defaultSize={30} minSize={20} maxSize={50} className="flex flex-col">
          <div className="flex flex-col h-full border-r border-[var(--border)] bg-[var(--surface-1)]/40">
            <AgentPanel running={running} progress={sse.progress} />
            <div className="flex-1 min-h-0">
              <ChatInput
                messages={chatMessages}
                running={running}
                onSend={handleSend}
                onStop={handleStop}
                files={filePaths}
              />
            </div>
          </div>
        </Panel>

        {/* Divisor arrastável */}
        <Separator className="w-[3px] bg-[var(--border)] hover:bg-[var(--primary)]/40 active:bg-[var(--primary)]/60 transition-colors cursor-col-resize relative group">
          <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-4 rounded-full bg-[var(--surface-1)] border border-[var(--border)] group-hover:border-[var(--primary)]/40 transition-colors grid place-items-center">
            <div className="size-1 rounded-full bg-[var(--text-ghost)] group-hover:bg-[var(--primary)] transition-colors" />
          </div>
        </Separator>

        {/* RIGHT: Editor + Preview */}
        <Panel defaultSize={70} minSize={50} maxSize={80} className="flex flex-col min-h-0">
          <div className="flex-1 flex min-h-0">
            {showFileTree && (
              <div className="w-[240px] shrink-0 border-r border-[var(--border)]">
                <FileTree
                  files={fileTreeFiles}
                  activePath={activeFilePath}
                  onSelectFile={handleSelectFile}
                  onCreateFile={handleCreateFile}
                  onCreateFolder={handleCreateFolder}
                  onRename={handleRename}
                  onDelete={handleDelete}
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              {activeView === "code" ? (
                <CodeEditor
                  tabs={openTabs}
                  activePath={activeFilePath}
                  onSelectTab={handleSelectFile}
                  onCloseTab={handleCloseTab}
                  onContentChange={handleContentChange}
                />
              ) : (
                <PreviewFrame
                  files={files?.map((f) => ({ path: f.path, content: f.content ?? "" })) ?? []}
                  running={running}
                  devUrl={project?.meta?.previewUrl ?? null}
                />
              )}
            </div>
          </div>
        </Panel>
      </Group>

      <StatusBar
        gitBranch="main"
        gitAhead={0}
        gitBehind={0}
        buildStatus={sse.progress.runtimeChecks.some((c) => c.ok) ? "ok" : null}
        cost={sse.progress.cost}
        model={sse.progress.model}
        skills={sse.progress.skills}
        connected={running}
        onToggleTerminal={() => toast.info("Terminal — em breve")}
        onToggleGitPanel={() => toast.info("Git Panel — em breve")}
      />
    </EditorShell>
  );
}
