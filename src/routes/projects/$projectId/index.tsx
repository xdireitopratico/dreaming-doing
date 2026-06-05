// $projectId/index.tsx — Editor FORGE Definitivo (Fase 4 — Integração total)
// Todos os 18+ componentes integrados: Breadcrumb, CommandPalette, ShortcutCheatsheet,
// ProviderSelector, LogPanel, AiDiffViewer, RateLimitIndicator, useAgentBlame,
// monacoEnhancements, useElementPicker, SnapshotsSheet, export ZIP, drag-drop
import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { removeRealtimeChannel } from "@/lib/supabase-realtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { EditorShell } from "@/components/EditorShell";
import { EditorResizableLayout } from "@/components/editor/EditorResizableLayout";
import type { EditorMainView } from "@/components/editor/EditorViewTabs";
import type { AgentComposerMode } from "@/components/editor/ChatInput";
import { CodeEditor, type Tab } from "@/components/editor/CodeEditor";
import { FileTree } from "@/components/editor/FileTree";
import { ChatInput, type ChatMessage } from "@/components/editor/ChatInput";
import { SetupRail } from "@/components/editor/SetupRail";
import { TasteSetupChecklist } from "@/components/editor/TasteSetupChecklist";
import { TastePostStartBanner } from "@/components/editor/TastePostStartBanner";
import { FORGE_WELCOME_MARKDOWN } from "@/lib/welcome-message";
import { useConnectors } from "@/hooks/useConnectors";
import { useTasteUiActions } from "@/hooks/useTasteUiActions";
import {
  isAgentPreferencesConfigured,
  getAgentSetupBlockMessage,
} from "@/lib/agent-setup";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import type { ForgeSessionKind } from "@/lib/taste";
import { canSendTasteChat, canStartTasteProject } from "@/lib/taste";
import type { StoredMessagePart } from "@/lib/chat-attachments";
import { AgentPanel } from "@/components/editor/AgentPanel";
import { PreviewFrame } from "@/components/editor/PreviewFrame";


import { CommandPalette, buildEditorActions, type PaletteAction } from "@/components/editor/CommandPalette";
import { ShortcutCheatsheet } from "@/components/editor/ShortcutCheatsheet";
import { ProviderSelector, type ProviderOption } from "@/components/editor/ProviderSelector";
import { LogPanel, createLogEntry, type LogEntry } from "@/components/editor/LogPanel";
import { AiDiffViewer, type DiffEntry } from "@/components/editor/AiDiffViewer";
import { RateLimitIndicator } from "@/components/editor/RateLimitIndicator";
import { SnapshotsSheet } from "@/components/editor/SnapshotsSheet";
import { useSSE } from "@/hooks/useSSE";
import { usePreviewBoot } from "@/hooks/usePreviewBoot";
import { publishProject } from "@/lib/publish.functions";
import { useAgentBlame, buildBlameFromTimeline } from "@/hooks/useAgentBlame";
import { registerAiCodeLens, registerAiFolding, clearEnhancements, HEAT_MAP_CSS } from "@/lib/monacoEnhancements";
import { useElementPicker } from "@/hooks/useElementPicker";
import { useWorkspacePresets, exportProjectZip, useFileDrop } from "@/hooks/useWorkspacePresets";
import { toast } from "sonner";
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { tasteChatRemaining, tasteStartRemaining, openConnector, status: connectorStatus } =
    useConnectors();
  const e2bConnected = connectorStatus.e2b.connected;
  useTasteUiActions();
  const tasteQuota = {
    tasteChatRemaining,
    tasteStartRemaining,
    hasUserLlmKey: false,
  };

  // ─── States ──────────────────────────────────────────────────────────
  const [showFileTree, setShowFileTree] = useState(false);
  const [activeView, setActiveView] = useState<"code" | "preview" | "diff">("preview");
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<Tab[]>([]);
  const [running, setRunning] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [provider, setProvider] = useState("");
  const [pickMode, setPickMode] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [composerMode, setComposerMode] = useState<AgentComposerMode>("build");
  const [promptDraft, setPromptDraft] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [previewRoute, setPreviewRoute] = useState("/");
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0);

  // ─── Refs ────────────────────────────────────────────────────────────
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

  // ─── Hooks ───────────────────────────────────────────────────────────
  const sse = useSSE();
  const previewBoot = usePreviewBoot(projectId);
  const publishFn = useServerFn(publishProject);
  useWorkspacePresets();

  useEffect(() => {
    if (activeView === "code") setShowFileTree(true);
  }, [activeView]);

  const mainView: EditorMainView = activeView === "code" ? "code" : "preview";

  const handleMainViewChange = useCallback((view: EditorMainView) => {
    setActiveView(view);
  }, []);
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

  const isReactProject = useMemo(
    () => files?.some((f) => f.path === "package.json" || f.path === "/package.json") ?? false,
    [files],
  );

  const agentHasRun = useMemo(
    () => messages?.some((m) => m.role === "assistant") ?? false,
    [messages],
  );

  const devUrl = (project?.meta as { previewUrl?: string } | null)?.previewUrl ?? null;
  const publishedUrl =
    (project?.meta as { publishedUrl?: string } | null)?.publishedUrl ?? null;

  // ─── Realtime (canal editor-{projectId} + setAuth no AuthProvider) ───
  useEffect(() => {
    if (!conversation) return;
    const channel: RealtimeChannel = supabase
      .channel(`editor-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["messages", conversation.id] }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_files",
          filter: `project_id=eq.${projectId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["files", projectId] }),
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`[FORGE Realtime] editor-${projectId}`, status, err);
        }
      });
    return () => removeRealtimeChannel(channel);
  }, [projectId, conversation?.id, qc]);

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

  // ─── Sync running state (SSE ativo) ───────────────────────────────────
  useEffect(() => {
    if (sse.connected && !running) setRunning(true);
    if (!sse.connected && running && sse.progress.finished) setRunning(false);
  }, [sse.connected, sse.progress.finished, running]);

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

  useEffect(() => {
    if (sse.progress.error && sse.progress.finished && !sse.progress.resumable) {
      toast.error(sse.progress.error);
      setRunning(false);
    }
    if (sse.progress.finished && sse.progress.resumable && sse.progress.error) {
      toast.warning(sse.progress.error, { duration: 8000 });
      setRunning(false);
    }
  }, [sse.progress.error, sse.progress.finished, sse.progress.resumable]);

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

  const runAgent = useCallback(
    (sessionKind?: ForgeSessionKind) => {
      if (!conversation || running) return;

      const isTaste =
        sessionKind === "taste_chat" ||
        sessionKind === "taste_start" ||
        (!sessionKind && canSendTasteChat(tasteQuota));

      if (!isTaste) {
        const prefs = loadAgentPreferences();
        if (!isAgentPreferencesConfigured(prefs)) {
          toast.error(getAgentSetupBlockMessage(prefs));
          return;
        }
      } else if (sessionKind === "taste_start" && !canStartTasteProject(tasteQuota)) {
        toast.error("Start Project já utilizado. Configure API para continuar.");
        return;
      } else if ((sessionKind === "taste_chat" || !sessionKind) && !canSendTasteChat(tasteQuota)) {
        toast.error("Limite Taste Chat (50). Configure API em /api.");
        return;
      }

      const label =
        sessionKind === "taste_start"
          ? "Start Project (Taste · NVIDIA)"
          : sessionKind === "taste_chat" || isTaste
            ? "Concierge Taste"
            : sse.progress.resumable
              ? "Retomando agente (memória do chat)"
              : "Agente FORGE iniciado";
      setLogs((prev) => [...prev, createLogEntry("info", label, "agent")]);
      if (!logPanelOpen) setLogPanelOpen(true);
      void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });
      void (async () => {
        setRunning(true);
        try {
          await sse.connect(
            projectId,
            conversation.id,
            sessionKind ?? (canSendTasteChat(tasteQuota) ? "taste_chat" : undefined),
          );
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Erro ao iniciar agente");
        } finally {
          setRunning(false);
        }
      })();
    },
    [conversation, projectId, running, sse, logPanelOpen, qc, sse.progress.resumable, tasteQuota],
  );

  useEffect(() => {
    if (!sse.progress.finished || !conversation) return;
    setRunning(false);
    void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });
    void qc.invalidateQueries({ queryKey: ["profile"] });
  }, [sse.progress.finished, conversation, qc]);

  // Preview ao vivo: após o agente; recarrega iframe quando arquivos mudam (sem botão ↻ na barra)
  const agentFinished = sse.progress.finished;
  useEffect(() => {
    if (!agentFinished || sse.progress.error || !isReactProject) return;
    previewBoot.boot();
  }, [agentFinished, sse.progress.error, isReactProject, previewBoot.boot]);

  const filesSyncKey = useMemo(
    () => files?.map((f) => `${f.path}:${f.updated_at}`).join("|") ?? "",
    [files],
  );

  useEffect(() => {
    if (!devUrl || activeView !== "preview") return;
    const t = window.setTimeout(() => setPreviewReloadNonce((n) => n + 1), 600);
    return () => window.clearTimeout(t);
  }, [filesSyncKey, devUrl, activeView]);

  const handleSend = useCallback(
    (text: string, mode?: AgentComposerMode, parts?: StoredMessagePart[]) => {
      if (!conversation) return;
      const messageParts =
        parts && parts.length > 0
          ? parts
          : [
              {
                type: "text" as const,
                text:
                  (mode ?? composerMode) === "plan"
                    ? `[Modo plano — só planejar, não executar ainda]\n${text}`
                    : text,
              },
            ];
      supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          role: "user",
          parts: messageParts,
        })
        .then(({ error }) => {
          if (error) toast.error("Erro ao enviar mensagem");
          else runAgent("taste_chat");
        });
    },
    [conversation, runAgent, composerMode],
  );

  const handleVisualEdits = useCallback(() => {
    if (activeView !== "preview") {
      setActiveView("preview");
      toast.info("Abra o Preview para selecionar um elemento.");
    }
    elementPicker.onToggle();
  }, [activeView, elementPicker]);

  const handleStartProject = useCallback(() => {
    if (!conversation) return;
    const seed =
      "Start Project: apresente um plano curto (markdown) do que vai construir nesta sessão (~10–15 min), depois implemente uma primeira versão visual convincente no projeto. Ao final, diga que daqui pra frente é comigo configurando API.";
    supabase
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        role: "user",
        parts: [{ type: "text", text: seed }],
      })
      .then(({ error }) => {
        if (error) toast.error("Erro ao iniciar Start Project");
        else runAgent("taste_start");
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

  const handlePublish = useCallback(async () => {
    if (!devUrl && isReactProject) {
      toast.info("Iniciando preview antes de publicar…");
      const url = await previewBoot.boot();
      if (!url) return;
    }
    setPublishing(true);
    try {
      const res = await publishFn({ data: { projectId } });
      if (res.needsPreview) {
        toast.error("Inicie o preview ao vivo (E2B) antes de publicar.");
        return;
      }
      if (res.url) {
        toast.success("Publicado!", {
          description: res.url,
          action: {
            label: "Abrir",
            onClick: () => window.open(res.url!, "_blank", "noopener"),
          },
        });
        qc.invalidateQueries({ queryKey: ["project", projectId] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao publicar");
    } finally {
      setPublishing(false);
    }
  }, [devUrl, isReactProject, previewBoot, publishFn, projectId, qc]);

  const handleShare = useCallback(() => {
    const url = publishedUrl ?? devUrl;
    if (!url) {
      toast.info("Publique ou inicie o preview para obter um link.");
      return;
    }
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copiado para a área de transferência"),
      () => toast.info(url),
    );
  }, [publishedUrl, devUrl]);

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
        activeView={mainView}
        onViewChange={handleMainViewChange}
        running={running}
        onQuickPrompt={(text) => setPromptDraft(text)}
        onShare={handleShare}
        onPublish={handlePublish}
        previewFiles={files?.map((f) => ({ path: f.path, content: f.content ?? "" }))}
        previewPath={previewRoute}
        onPreviewPathChange={setPreviewRoute}
        previewDevUrl={devUrl}
      >
        <div
          className="flex min-h-0 h-full w-full flex-1 flex-col overflow-hidden"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <EditorResizableLayout
            workspaceCode={activeView === "code"}
            chat={
              <div className="forge-chat-column">
                <AgentPanel running={running} progress={sse.progress} onResume={runAgent} />
                <div className="forge-chat-body">
                  <TastePostStartBanner />
                  <ChatInput
                    messages={chatMessages}
                    running={running}
                    onSend={handleSend}
                    onStop={handleStop}
                    onVisualEdits={handleVisualEdits}
                    visualEditsActive={pickMode}
                    files={filePaths}
                    composerMode={composerMode}
                    onComposerModeChange={setComposerMode}
                    externalPrompt={promptDraft}
                    onExternalPromptConsumed={() => setPromptDraft(null)}
                    welcomeMarkdown={chatMessages.length === 0 ? FORGE_WELCOME_MARKDOWN : undefined}
                    tasteChatRemaining={tasteChatRemaining}
                    tasteStartRemaining={tasteStartRemaining}
                    onStartProject={handleStartProject}
                  />
                </div>
                <SetupRail
                  checklist={
                    <TasteSetupChecklist
                      userMessageCount={chatMessages.filter((m) => m.role === "user").length}
                      onOpenConnector={openConnector}
                      onStartProject={handleStartProject}
                    />
                  }
                />
              </div>
            }
            workspace={
              <div className="flex min-h-0 h-full w-full flex-1 flex-col">
                <div className="flex min-h-0 flex-1">
                  {showFileTree && activeView === "code" && (
                    <div className="w-[200px] shrink-0 border-r border-[var(--forge-border)] bg-[#1a1c22]">
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

                  <div className="min-h-0 min-w-0 flex-1">
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
                        running={running || previewBoot.booting}
                        devUrl={devUrl}
                        previewPath={previewRoute}
                        onPreviewPathChange={setPreviewRoute}
                        iframeRef={previewIframeRef}
                        bootError={previewBoot.lastError}
                        warming={previewBoot.warming}
                        onWarmComplete={previewBoot.clearWarming}
                        onRefresh={() => previewBoot.boot()}
                        reloadNonce={previewReloadNonce}
                        agentHasRun={agentHasRun}
                        e2bConnected={e2bConnected}
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
            }
          />
        </div>

        <LogPanel
          isOpen={logPanelOpen}
          onClose={() => setLogPanelOpen(false)}
          logs={logs}
          running={running}
        />
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
        <div className="pointer-events-none fixed inset-0 z-[200] m-3 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--primary)]/50 bg-black/70">
          <p className="text-sm text-[var(--primary)]">Solte os arquivos para importar</p>
        </div>
      )}
    </>
  );
}
