// $projectId.tsx — Editor FORGE (Refatorado v3)
// Layout 30/70 split com divisor arrastável, todos os componentes integrados
// Design system da home aplicado em cada elemento
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import { useSSE, type AgentProgress } from "@/hooks/useSSE";
import {
  Code2, Eye, PanelLeft, FolderOpen, Loader2, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { streamAgentRun, type AgentEvent } from "@/lib/agent-stream";

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

type Project = {
  id: string; name: string; meta: { previewUrl?: string; previewExpiresAt?: string } | null;
};

function EditorPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const qc = useQueryClient();

  // ─── Estado local ───
  const [input, setInputState] = useState("");
  const [showFileTree, setShowFileTree] = useState(true);
  const [activeView, setActiveView] = useState<"code" | "preview">("code");
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<Tab[]>([]);

  // ─── SSE ───
  const sse = useSSE();

  // ─── Queries ───

  const { data: project } = useQuery<Project | null>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*").eq("id", projectId).single();
      return data;
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

  // ─── Realtime ───

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

  // ─── Derivados ───

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

  // ─── Handlers ───

  const handleSelectFile = useCallback((path: string) => {
    setActiveFilePath(path);
    setActiveView("code");

    // Adiciona tab se não existe
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

  const handleSend = useCallback((text: string) => {
    if (!conversation) return;

    supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      parts: [{ type: "text", text }],
    }).then(({ error }) => {
      if (error) toast.error("Erro ao enviar mensagem");
    });

    sse.connect(projectId, conversation.id);
  }, [conversation, projectId, sse]);

  const handleStop = useCallback(() => {
    sse.disconnect();
    toast.info("Agente interrompido");
  }, [sse]);

  const handleCreateFile = useCallback((parentPath: string) => {
    // TODO: modal de nome de arquivo → fs_write via agente
    toast.info("Criar arquivo — via chat com o agente: 'Crie um arquivo X'");
  }, []);

  const handleCreateFolder = useCallback((parentPath: string) => {
    toast.info("Criar pasta — via chat com o agente: 'Crie a pasta X'");
  }, []);

  const handleRename = useCallback((oldPath: string, newPath: string) => {
    // TODO: shell_exec "mv old new"
    toast.info(`Renomear: ${oldPath} → ${newPath}`);
  }, []);

  const handleDelete = useCallback((path: string) => {
    // TODO: shell_exec "rm path"
    toast.info(`Deletar: ${path}`);
  }, []);

  // Auto-run quando última mensagem é do usuário
  const lastUserMsg = useMemo(() => {
    if (!chatMessages.length) return false;
    const last = chatMessages[chatMessages.length - 1];
    return last.role === "user";
  }, [chatMessages]);

  useEffect(() => {
    if (lastUserMsg && conversation && !sse.connected) {
      sse.connect(projectId, conversation.id);
    }
  }, [lastUserMsg, conversation?.id]);

  // ─── Fern ───

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

          {sse.connected && (
            <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em] uppercase text-[var(--primary)]">
              <Loader2 className="size-3 animate-spin" />
              FORGING
            </span>
          )}
        </div>
      }
    >
      {/* Main layout: Split 30/70 */}
      <Group orientation="horizontal" className="h-full">
        {/* ─── LEFT: Chat + AgentPanel ─── */}
        <Panel defaultSize={30} minSize={20} maxSize={50} className="flex flex-col">
          <div className="flex flex-col h-full border-r border-[var(--border)] bg-[var(--surface-1)]/40">
            {/* Agent Panel com animação condicional */}
            <AgentPanel running={sse.connected} progress={sse.progress} />

            {/* Chat */}
            <div className="flex-1 min-h-0">
              <ChatInput
                messages={chatMessages}
                running={sse.connected}
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

        {/* ─── RIGHT: Editor + Preview ─── */}
        <Panel defaultSize={70} minSize={50} maxSize={80} className="flex flex-col min-h-0">
          <div className="flex-1 flex min-h-0">
            {/* File Tree (colapsável) */}
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

            {/* Content: Code ou Preview */}
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
                  running={sse.connected}
                  devUrl={null}
                />
              )}
            </div>
          </div>
        </Panel>
      </Group>

      {/* Statusbar */}
      <StatusBar
        gitBranch="main"
        gitAhead={0}
        gitBehind={0}
        buildStatus={sse.progress.runtimeChecks.some((c) => c.ok) ? "ok" : null}
        cost={sse.progress.cost}
        model={sse.progress.model}
        skills={sse.progress.skills}
        connected={sse.connected}
        onToggleTerminal={() => toast.info("Terminal — em breve")}
        onToggleGitPanel={() => toast.info("Git Panel — em breve")}
      />
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
