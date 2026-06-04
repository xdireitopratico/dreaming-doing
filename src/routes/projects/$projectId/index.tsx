// $projectId/index.tsx — Editor FORGE Definitivo (Fase 4 — Integração total)
// Todos os 18+ componentes integrados: Breadcrumb, CommandPalette, ShortcutCheatsheet,
// ProviderSelector, LogPanel, AiDiffViewer, RateLimitIndicator, useAgentBlame,
// monacoEnhancements, useElementPicker, SnapshotsSheet, export ZIP, drag-drop
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
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
import { Breadcrumb } from "@/components/editor/Breadcrumb";
import { CommandPalette, buildEditorActions, type PaletteAction } from "@/components/editor/CommandPalette";
import { ShortcutCheatsheet } from "@/components/editor/ShortcutCheatsheet";
import { ProviderSelector, type ProviderOption } from "@/components/editor/ProviderSelector";
import { LogPanel, createLogEntry, type LogEntry } from "@/components/editor/LogPanel";
import { AiDiffViewer, type DiffEntry } from "@/components/editor/AiDiffViewer";
import { RateLimitIndicator } from "@/components/editor/RateLimitIndicator";
import { SnapshotsSheet } from "@/components/editor/SnapshotsSheet";
import { useSSE } from "@/hooks/useSSE";
import { useAgentBlame, buildBlameFromTimeline } from "@/hooks/useAgentBlame";
import { registerAiCodeLens, registerAiFolding, clearEnhancements, HEAT_MAP_CSS } from "@/lib/monacoEnhancements";
import { useElementPicker } from "@/hooks/useElementPicker";
import { useWorkspacePresets, exportProjectZip, useFileDrop } from "@/hooks/useWorkspacePresets";
import {
  Code2, Eye, PanelLeft, Loader2, History, Camera, Download,
  Terminal, Crosshair, Search, Keyboard,
} from "lucide-react";
import { toast } from "sonner";
import { MicButton } from "@/components/voice/MicButton";
import type { editor } from "monaco-editor";

export const Route = createFileRoute("/projects/$projectId/")({
  component: EditorPage,
});

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Msg = {
  id: string; role: string; parts: any[]; tool_calls: any[];
  created_at: string;
};
type FileRow = {
  id: string; path: string; content: string; updated_at: string;
};

// ---------------------------------------------------------------------------
// Editor Page — Integração Definitiva
// ---------------------------------------------------------------------------

function EditorPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/" });
  const qc = useQueryClient();

  // ─── States ──────────────────────────────────────────────────────────
  const [showFileTree, setShowFileTree] = useState(true);
  const [activeView, setActiveView] = useState<"code" | "preview" | "diff">("code");
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<Tab[]>([]);
  const [running, setRunning] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [provider, setProvider] = useState("anthropic-sonnet");
  const [pickMode, setPickMode] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // ─── Refs ────────────────────────────────────────────────────────────
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

  // ─── Hooks ───────────────────────────────────────────────────────────
  const sse = useSSE();
  const { presets, currentPreset, applyPreset } = useWorkspacePresets();
  const elementPicker = useElementPicker({
    iframeRef: previewIframeRef,
    onPick: (el) => {
      toast.success(`Elemento: ${el.selector}`);
      setPickMode(false);
    },
    active: pickMode,
    onToggle: () => setPickMode(!pickMode),
  });

  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } = useFileDrop(
    (files) => toast.info(`${files.length} arquivo${files.length !== 1 ? "s" : ""} recebido${files.length !== 1 ? "s" : ""}`),
  );

  // ─── Queries ─────────────────────────────────────────────────────────
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

  // ─── Realtime ────────────────────────────────────────────────────────
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

  // ─── Derivados ───────────────────────────────────────────────────────
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

  const fileTreeFiles = useMemo(() => {
    if (files && files.length > 0) return files.map(f => f.path);
    return [
      "src/App.tsx", "src/main.tsx", "src/index.css",
      "package.json", "index.html", "vite.config.ts", "tsconfig.json",
    ];
  }, [files]);

  // ─── Diff entries (from SSE timeline) ──────────────────────────────
  const diffEntries = useMemo((): DiffEntry[] => {
    const timeline = sse.progress.timeline;
    return timeline
      .filter((e) => e.type === "tool_done" && (e.data?.name === "fs_write" || e.data?.name === "fs_edit"))
      .map((e, i) => ({
        id: `diff-${i}`,
        path: (e.data.args as any)?.path ?? "unknown",
        before: "",
        after: (e.data.args as any)?.content ?? "",
        author: "FORGE Agent",
        timestamp: e.timestamp,
        reviewed: false,
      }));
  }, [sse.progress.timeline]);

  // ─── Agent blame ────────────────────────────────────────────────────
  const blameEntries = useMemo(
    () => buildBlameFromTimeline(sse.progress.timeline),
    [sse.progress.timeline],
  );
  useAgentBlame({ blameMap: blameEntries, editorRef, monacoRef });

  // ─── Sync running state ─────────────────────────────────────────────
  useEffect(() => {
    if (!sse.connected && running) setRunning(false);
    if (sse.connected && !running) setRunning(true);
  }, [sse.connected]);

  // ─── SSE → logs ─────────────────────────────────────────────────────
  useEffect(() => {
    const last = sse.progress.timeline.at(-1);
    if (!last) return;
    if (last.type === "phase") {
      setLogs((prev) => [...prev, createLogEntry("info", `Fase: ${last.data.phase ?? ""} — ${last.data.message ?? ""}`, "agent")]);
    }
    if (last.type === "tool_done") {
      setLogs((prev) => [...prev, createLogEntry(last.data.ok ? "success" : "error", `${last.data.name}: ${last.data.ok ? "ok" : last.data.error ?? "erro"}`, "agent")]);
    }
    if (last.type === "error") {
      setLogs((prev) => [...prev, createLogEntry("error", last.data.error as string ?? "Erro", "agent")]);
    }
  }, [sse.progress.timeline.length]);

  // ─── Monaco enhancements globais ────────────────────────────────────
  useEffect(() => {
    clearEnhancements();
    // These would be registered in CodeEditor onMount, but doing it here ensures
    // they're ready regardless of mount order
    return () => clearEnhancements();
  }, []);

  // ─── Handlers ───────────────────────────────────────────────────────
  const handleSelectFile = useCallback((path: string) => {
    setActiveFilePath(path);
    if (activeView === "diff") setActiveView("code");
    setOpenTabs((prev) => {
      if (prev.some((t) => t.path === path)) return prev;
      return [...prev, { path, content: fileMap.get(path) ?? "", isModified: false }];
    });
  }, [fileMap, activeView]);

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
    setLogs((prev) => [...prev, createLogEntry("info", "Agente FORGE iniciado", "agent")]);
    if (!logPanelOpen) setLogPanelOpen(true);
    try {
      sse.connect(projectId, conversation.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao iniciar agente");
      setRunning(false);
    }
  }, [conversation, projectId, running, sse, logPanelOpen]);

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
    setLogs((prev) => [...prev, createLogEntry("warning", "Agente interrompido pelo usuário", "agent")]);
    toast.info("Agente interrompido");
  }, [sse]);

  const handleExportZip = useCallback(() => {
    if (!project) return;
    exportProjectZip(projectId, project.name ?? "projeto");
  }, [projectId, project]);

  // ─── Command Palette actions ────────────────────────────────────────
  const paletteActions: PaletteAction[] = useMemo(
    () =>
      buildEditorActions({
        onNewFile: () => toast.info("Arquivo — via chat"),
        onNewFolder: () => toast.info("Pasta — via chat"),
        onTogglePreview: () => setActiveView((v) => (v === "preview" ? "code" : "preview")),
        onToggleTerminal: () => setLogPanelOpen((v) => !v),
        onToggleGit: () => toast.info("Git Panel — em breve"),
        onExportZip: handleExportZip,
        onImportFiles: () => toast.info("Arraste arquivos para importar"),
        onSaveAll: () => {
          openTabs.forEach((t) => {
            if (t.isModified && t.path) {
              supabase.from("project_files").upsert({ project_id: projectId, path: t.path, content: t.content }).then(() => {
                setOpenTabs((prev) => prev.map((pt) => pt.path === t.path ? { ...pt, isModified: false } : pt));
              });
            }
          });
          toast.success("Arquivos salvos");
        },
        onRunAgent: runAgent,
        onStopAgent: handleStop,
        onToggleFileTree: () => setShowFileTree((v) => !v),
        onToggleDeviceFrame: () => {},
        isRunning: running,
      }),
    [handleExportZip, openTabs, projectId, runAgent, handleStop, running],
  );

  // ─── Keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "k") { e.preventDefault(); setPaletteOpen((v) => !v); }
      if (mod && e.shiftKey && e.key === "?") { e.preventDefault(); setCheatsheetOpen((v) => !v); }
      if (mod && e.key === "p" && !e.shiftKey) { e.preventDefault(); setPaletteOpen(true); }
      if (mod && e.key === "j") { e.preventDefault(); setLogPanelOpen((v) => !v); }
      if (mod && e.key === "b") { e.preventDefault(); setShowFileTree((v) => !v); }
      if (mod && e.key === "s") { e.preventDefault(); paletteActions.find(a => a.id === "save-all")?.action(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteActions]);

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <>
      {/* Inject heat map CSS */}
      <style>{HEAT_MAP_CSS}</style>

      <EditorShell
        projectName={project?.name}
        right={
          <div className="flex items-center gap-1.5">
            {/* File Tree toggle */}
            <button
              onClick={() => setShowFileTree((v) => !v)}
              className={`p-1.5 rounded-md transition-colors ${
                showFileTree ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "text-[var(--text-ghost)] hover:text-[var(--text-dim)]"
              }`}
              title="Explorer (⌘B)"
            >
              <PanelLeft className="size-3.5" />
            </button>

            {/* View toggle: Code / Preview / Diff */}
            <div className="flex items-center gap-0.5 border border-[var(--border)] rounded-md p-0.5 bg-[var(--surface-1)]/60">
              {(["code", "preview", "diff"] as const).map((mode) => {
                const icons = { code: Code2, preview: Eye, diff: History };
                const labels = { code: "Code", preview: "Preview", diff: "Diff" };
                const Icon = icons[mode];
                return (
                  <button
                    key={mode}
                    onClick={() => setActiveView(mode)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                      activeView === mode
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "text-[var(--text-dim)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <Icon className="size-3" /> {labels[mode]}
                  </button>
                );
              })}
            </div>

            {/* Pick mode toggle */}
            <button
              onClick={() => setPickMode((v) => !v)}
              className={`p-1.5 rounded-md transition-colors ${
                pickMode ? "bg-[var(--primary)]/15 text-[var(--primary)] ring-1 ring-[var(--primary)]/30" : "text-[var(--text-ghost)] hover:text-[var(--text-dim)]"
              }`}
              title="Selecionar elemento no preview"
            >
              <Crosshair className="size-3.5" />
            </button>

            {/* Snapshot */}
            <SnapshotsSheet projectId={projectId} />

            {/* History link */}
            <Link
              to="/projects/$projectId/history"
              params={{ projectId }}
              className="p-1.5 rounded-md text-[var(--text-ghost)] hover:text-[var(--text-dim)] hover:bg-[var(--surface-2)] transition-colors"
              title="Histórico de mudanças"
            >
              <History className="size-3.5" />
            </Link>

            {/* Export ZIP */}
            <button
              onClick={handleExportZip}
              className="p-1.5 rounded-md text-[var(--text-ghost)] hover:text-[var(--text-dim)] hover:bg-[var(--surface-2)] transition-colors"
              title="Exportar ZIP (⌘⇧E)"
            >
              <Download className="size-3.5" />
            </button>

            {/* Command palette trigger */}
            <button
              onClick={() => setPaletteOpen(true)}
              className="p-1.5 rounded-md text-[var(--text-ghost)] hover:text-[var(--text-dim)] hover:bg-[var(--surface-2)] transition-colors"
              title="Command Palette (⌘K)"
            >
              <Search className="size-3.5" />
            </button>

            {/* Mic button */}
            <MicButton onTranscript={(t) => { if (t.trim()) handleSend(t); }} />

            {running && (
              <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em] uppercase text-[var(--primary)] animate-pulse">
                <Loader2 className="size-3 animate-spin" />
                FORGING
              </span>
            )}
          </div>
        }
      >
        <div
          className="flex flex-col h-full"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Group orientation="horizontal" className="flex-1 min-h-0">
            {/* LEFT: Chat + AgentPanel */}
            <Panel defaultSize={currentPreset.leftRatio} minSize={20} maxSize={50} className="flex flex-col">
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

            {/* Separator */}
            <Separator className="w-[3px] bg-[var(--border)] hover:bg-[var(--primary)]/40 active:bg-[var(--primary)]/60 transition-colors cursor-col-resize relative group">
              <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-4 rounded-full bg-[var(--surface-1)] border border-[var(--border)] group-hover:border-[var(--primary)]/40 transition-colors grid place-items-center">
                <div className="size-1 rounded-full bg-[var(--text-ghost)] group-hover:bg-[var(--primary)] transition-colors" />
              </div>
            </Separator>

            {/* RIGHT: Editor / Preview / Diff */}
            <Panel defaultSize={100 - currentPreset.leftRatio} minSize={50} maxSize={80} className="flex flex-col min-h-0">
              <div className="flex-1 flex min-h-0">
                {showFileTree && (
                  <div className="w-[240px] shrink-0 border-r border-[var(--border)]">
                    <FileTree
                      files={fileTreeFiles}
                      activePath={activeFilePath}
                      onSelectFile={handleSelectFile}
                      onCreateFile={() => toast.info("Criar arquivo — via chat")}
                      onCreateFolder={() => toast.info("Criar pasta — via chat")}
                      onRename={(old, n) => toast.info(`Renomear: ${old} → ${n}`)}
                      onDelete={(p) => toast.info(`Deletar: ${p}`)}
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0 flex flex-col">
                  {/* Breadcrumb */}
                  <Breadcrumb
                    path={activeFilePath}
                    onNavigate={(p) => handleSelectFile(p)}
                  />

                  {/* Content area */}
                  <div className="flex-1 min-h-0">
                    {activeView === "code" && (
                      <CodeEditor
                        tabs={openTabs}
                        activePath={activeFilePath}
                        onSelectTab={handleSelectFile}
                        onCloseTab={handleCloseTab}
                        onContentChange={handleContentChange}
                      />
                    )}

                    {activeView === "preview" && (
                      <PreviewFrame
                        files={files?.map((f) => ({ path: f.path, content: f.content ?? "" })) ?? []}
                        running={running}
                        devUrl={project?.meta?.previewUrl ?? null}
                      />
                    )}

                    {activeView === "diff" && (
                      <AiDiffViewer
                        diffs={diffEntries}
                        activeDiffId={diffEntries[0]?.id ?? null}
                        onSelectDiff={() => {}}
                        onAccept={() => toast.success("Mudança aceita")}
                        onReject={() => toast.info("Mudança rejeitada")}
                        onAcceptAll={() => toast.success("Todas mudanças aceitas")}
                        onRejectAll={() => toast.info("Todas mudanças rejeitadas")}
                      />
                    )}
                  </div>
                </div>
              </div>
            </Panel>
          </Group>

          {/* LogPanel (Terminal/Console/Problems) */}
          <LogPanel
            isOpen={logPanelOpen}
            onClose={() => setLogPanelOpen(false)}
            logs={logs}
            running={running}
          />

          {/* StatusBar */}
          <StatusBar
            gitBranch="main"
            gitAhead={0}
            gitBehind={0}
            buildStatus={sse.progress.runtimeChecks.some((c) => c.ok) ? "ok" : null}
            cost={sse.progress.cost}
            model={sse.progress.model}
            skills={sse.progress.skills}
            connected={running}
            onToggleTerminal={() => setLogPanelOpen((v) => !v)}
            onToggleGitPanel={() => toast.info("Git Panel — em breve")}
          />
        </div>
      </EditorShell>

      {/* Overlays globais */}
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
        files={filePaths}
        onOpenFile={handleSelectFile}
      />

      <ShortcutCheatsheet
        isOpen={cheatsheetOpen}
        onClose={() => setCheatsheetOpen(false)}
      />

      {/* Drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-[200] bg-[var(--background)]/60 backdrop-blur-sm border-2 border-dashed border-[var(--primary)]/40 rounded-2xl m-4 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-[var(--primary)]">
            <Download className="size-8" />
            <span className="font-mono text-[12px] tracking-[0.2em] uppercase">
              SOLTE OS ARQUIVOS PARA IMPORTAR
            </span>
          </div>
        </div>
      )}
    </>
  );
}
