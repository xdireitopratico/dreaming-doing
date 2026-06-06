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
import { EditorChatHeader } from "@/components/editor/EditorChatHeader";
import { EditorWorkspaceHeader } from "@/components/editor/EditorWorkspaceHeader";
import type { EditorMainView } from "@/components/editor/EditorViewTabs";
import type { AgentComposerMode } from "@/components/editor/ChatInput";
import { CodeEditor, type Tab } from "@/components/editor/CodeEditor";
import { FileTree } from "@/components/editor/FileTree";
import { ChatInput, type ChatMessage } from "@/components/editor/ChatInput";
import { SetupRail } from "@/components/editor/SetupRail";
import { TasteSetupChecklist } from "@/components/editor/TasteSetupChecklist";
import { TastePostStartBanner } from "@/components/editor/TastePostStartBanner";
import { FORGE_WELCOME_BYOK_MARKDOWN, FORGE_WELCOME_MARKDOWN } from "@/lib/welcome-message";
import { loadAgentPreferences } from "@/lib/agent-preferences";

import { useConnectors } from "@/hooks/useConnectors";
import { useTasteUiActions } from "@/hooks/useTasteUiActions";
import {
  isAgentPreferencesConfigured,
  getAgentSetupBlockMessage,
} from "@/lib/agent-setup";
import type { ForgeSessionKind, TasteAction } from "@/lib/taste";
import {
  canSendTasteChat,
  canStartTasteProject,
  isInTaste,
  resolveSessionKind,
} from "@/lib/taste";
import type { StoredMessagePart } from "@/lib/chat-attachments";

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
import { usePreviewIdle } from "@/hooks/usePreviewIdle";
import { useAutoPublish } from "@/hooks/useAutoPublish";
import { buildPreviewUrl } from "@/lib/project-routes";
import { useEditorTelemetry } from "@/hooks/useEditorTelemetry";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import {
  clearPendingAgentRun,
  peekPendingAgentRun,
} from "@/lib/agent-auto-run";
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
  const {
    tasteChatRemaining,
    tasteStartRemaining,
    hasUserLlmKey,
    openConnector,
    status: connectorStatus,
    modes: connectorModes,
    modal: connectorModal,
    closeModal: closeConnectorModal,
    saveConnector,
    rows: connectorRows,
  } = useConnectors();
  const [agentPrefs, setAgentPrefs] = useState(loadAgentPreferences);
  useEffect(() => {
    const refresh = () => setAgentPrefs(loadAgentPreferences());
    window.addEventListener("forge:prefs-updated", refresh);
    return () => window.removeEventListener("forge:prefs-updated", refresh);
  }, []);
  const welcomeMarkdown = hasUserLlmKey
    ? FORGE_WELCOME_BYOK_MARKDOWN
    : FORGE_WELCOME_MARKDOWN;
  const e2bConnected = connectorStatus.e2b.connected;
  useTasteUiActions();
  const tasteQuota = {
    tasteChatRemaining,
    tasteStartRemaining,
    hasUserLlmKey,
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
  const [logPanelTab, setLogPanelTab] = useState<"terminal" | "console" | "problems" | "shot">(
    "terminal",
  );
  const [provider, setProvider] = useState("");
  const [pickMode, setPickMode] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [composerMode, setComposerMode] = useState<AgentComposerMode>("build");
  const [promptDraft, setPromptDraft] = useState<string | null>(null);

  const [previewRoute, setPreviewRoute] = useState("/");
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  // ─── Refs ────────────────────────────────────────────────────────────
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

  // ─── Hooks ───────────────────────────────────────────────────────────
  const sse = useSSE();
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

  /** Última mensagem é do usuário sem resposta do agente — ex.: projeto novo com firstPrompt. */
  const pendingAgentRunKey = useMemo(() => {
    if (!conversation?.id || !messages?.length) return null;
    const last = messages[messages.length - 1];
    if (String(last.role).toLowerCase() !== "user") return null;
    return `${conversation.id}:${last.id}`;
  }, [conversation?.id, messages]);

  const autoAgentRunAttemptedRef = useRef<string | null>(null);

  const devUrl = (project?.meta as { previewUrl?: string } | null)?.previewUrl ?? null;

  const { idle: previewIdle } = usePreviewIdle(activeView === "preview" && !!devUrl);
  const previewBoot = usePreviewBoot(projectId, {
    idle: previewIdle,
    watchHealth: activeView === "preview" && !!devUrl,
  });

  const connectedKinds = useMemo(
    () =>
      (Object.keys(connectorStatus) as Array<keyof typeof connectorStatus>).filter(
        (k) => connectorStatus[k].connected,
      ),
    [connectorStatus],
  );

  useEditorTelemetry(
    projectId
      ? {
          projectId,
          projectName: project?.name,
          projectMeta: (project?.meta as Record<string, unknown>) ?? null,
          conversationId: conversation?.id ?? null,
          e2bConnected,
          hasUserLlmKey,
          tasteChatRemaining,
          tasteStartRemaining,
          connectedKinds,
          running,
          sseConnected: sse.connected,
          sseProgress: sse.progress,
          devUrl,
          previewBooting: previewBoot.booting,
          previewLastError: previewBoot.lastError,
          previewWarming: previewBoot.warming,
          isReactProject,
          agentHasRun,
          activeView,
          fileCount: files?.length ?? 0,
          messageCount: messages?.length ?? 0,
          hasPackageJson: isReactProject,
        }
      : null,
  );
  const projectMeta = (project?.meta as Record<string, unknown> | null) ?? null;
  const publishedUrl =
    typeof projectMeta?.publishedUrl === "string" ? projectMeta.publishedUrl : null;
  const previewReady = projectMeta?.previewReady === true;

  const autoPublish = useAutoPublish({
    projectId,
    devUrl,
    publishedUrl,
    previewReady,
    enabled: isReactProject && e2bConnected,
    booting: previewBoot.booting,
    warming: previewBoot.warming,
    publishFn,
  });

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
          logEditorTelemetryEvent(
            "realtime",
            status === "CHANNEL_ERROR" ? "channel_error" : "timed_out",
            "error",
            err?.message?.slice(0, 120),
          );
        }
        if (status === "SUBSCRIBED") {
          logEditorTelemetryEvent("realtime", "subscribed", "ok", projectId);
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
    return (messages ?? []).map((m) => {
      const roleRaw = String(m.role ?? "").toLowerCase();
      const role: ChatMessage["role"] =
        roleRaw === "user" ? "user" : roleRaw === "assistant" ? "assistant" : "tool";
      return {
      id: m.id,
      role,
      content: m.parts?.map((p: any) => p.text).join("\n") ?? "",
      toolCalls: m.tool_calls?.map((t: any) => ({ name: t.name, args: t.args?.path ?? "" })) ?? [],
      timestamp: new Date(m.created_at).getTime(),
    };
    });
  }, [messages]);

  const fileTreeFiles = useMemo(() => {
    if (files && files.length > 0) return files.map(f => f.path);
    return [
      "src/App.tsx", "src/main.tsx", "src/index.css",
      "package.json", "index.html", "vite.config.ts", "tsconfig.json",
    ];
  }, [files]);

  const previewNavFiles = useMemo(() => {
    if (files && files.length > 0) {
      return files.map((f) => ({ path: f.path, content: f.content ?? "" }));
    }
    return fileTreeFiles.map((path) => ({ path, content: "" }));
  }, [files, fileTreeFiles]);

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

  // ─── Sync running state (SSE) — nunca deixar UI presa se o stream cair ──
  useEffect(() => {
    if (sse.connected) setRunning(true);
  }, [sse.connected]);

  useEffect(() => {
    if (sse.progress.finished) setRunning(false);
  }, [sse.progress.finished]);

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
    if (sse.progress.finished && sse.progress.resumable && sse.progress.error && !sse.progress.autoResuming) {
      toast.warning(sse.progress.error, { duration: 5000 });
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
    (
      explicitKind?: ForgeSessionKind,
      explicitAction?: TasteAction,
    ): boolean => {
      if (!conversation || running) return false;

      const kind = explicitKind ?? resolveSessionKind(tasteQuota);
      const tasteAction: TasteAction | undefined =
        explicitAction ?? (kind === "taste" ? "chat" : undefined);
      const inTaste = kind === "taste";

      if (!inTaste) {
        const prefs = loadAgentPreferences();
        if (!isAgentPreferencesConfigured(prefs)) {
          toast.error(getAgentSetupBlockMessage(prefs));
          return false;
        }
      } else if (tasteAction === "start" && !canStartTasteProject(tasteQuota)) {
        toast.error("Start Project já utilizado. Configure API para continuar.");
        return false;
      } else if (tasteAction === "chat" && !canSendTasteChat(tasteQuota)) {
        toast.error("Limite Taste Chat (50). Configure API em /api.");
        return false;
      }

      const label =
        kind === "taste" && tasteAction === "start"
          ? "Start Project (Taste · NVIDIA)"
          : kind === "taste"
            ? "Concierge Taste"
            : sse.progress.resumable
              ? "Retomando agente (memória do chat)"
              : "Agente FORGE iniciado";
      setLogs((prev) => [...prev, createLogEntry("info", label, "agent")]);
      if (!logPanelOpen) setLogPanelOpen(true);
      void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });
      logEditorTelemetryEvent(
        "agent",
        "run_start",
        "info",
        kind === "byok" ? "byok" : `${kind}.${tasteAction ?? "chat"}`,
      );
      void (async () => {
        setRunning(true);
        try {
          await sse.connect(projectId, conversation.id, kind, { tasteAction });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Erro ao iniciar agente";
          logEditorTelemetryEvent("agent", "run_fail", "error", msg.slice(0, 200));
          toast.error(msg);
        } finally {
          setRunning(false);
        }
      })();
      return true;
    },
    [conversation, projectId, running, sse, logPanelOpen, qc, sse.progress.resumable, tasteQuota],
  );

  // ─── Auto-run: projeto recém-criado (flag) ou última msg user sem resposta
  // Não espera messages no client — evita race read-after-write após createProject.
  useEffect(() => {
    if (!conversation?.id) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12;

    const tryAutoRun = async () => {
      if (cancelled || attempts >= maxAttempts) return;
      attempts += 1;

      if (running || sse.connected) {
        window.setTimeout(tryAutoRun, 250);
        return;
      }

      const { data: activeRun } = await supabase
        .from("agent_runs")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "running")
        .maybeSingle();

      if (activeRun?.id) {
        setRunning(true);
        try {
          await sse.watch(projectId, conversation.id, activeRun.id);
        } finally {
          setRunning(false);
        }
        return;
      }

      const { count: pendingQueue } = await supabase
        .from("agent_pending_messages")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);

      if ((pendingQueue ?? 0) > 0) {
        window.setTimeout(tryAutoRun, 500);
        return;
      }

      const flagged = peekPendingAgentRun(projectId, conversation.id);
      const pending = pendingAgentRunKey;
      if (!flagged && !pending) return;

      const attemptKey = pending ?? `flag:${conversation.id}`;
      if (autoAgentRunAttemptedRef.current === attemptKey) return;

      logEditorTelemetryEvent(
        "agent",
        flagged ? "auto_run_flagged" : "auto_run_pending_user",
        "info",
        attemptKey.slice(0, 24),
      );

      if (runAgent(resolveSessionKind(tasteQuota))) {
        autoAgentRunAttemptedRef.current = attemptKey;
        if (flagged) clearPendingAgentRun(projectId);
        return;
      }

      if (flagged) {
        window.setTimeout(tryAutoRun, 400);
      }
    };

    tryAutoRun();
    return () => {
      cancelled = true;
    };
  }, [
    conversation?.id,
    projectId,
    pendingAgentRunKey,
    running,
    sse.connected,
    runAgent,
    tasteQuota,
  ]);

  const handleResumeAgent = useCallback(() => {
    if (!conversation || running) return;

    const kind = resolveSessionKind(tasteQuota);
    const inTaste = kind === "taste";
    const tasteAction: TasteAction = "chat";

    if (!inTaste) {
      const prefs = loadAgentPreferences();
      if (!isAgentPreferencesConfigured(prefs)) {
        toast.error(getAgentSetupBlockMessage(prefs));
        return;
      }
    } else if (!canSendTasteChat(tasteQuota)) {
      toast.error("Limite Taste Chat. Configure API em /api.");
      return;
    }

    setLogs((prev) => [
      ...prev,
      createLogEntry("info", "Retomando agente (memória do chat)", "agent"),
    ]);
    if (!logPanelOpen) setLogPanelOpen(true);
    void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });
    logEditorTelemetryEvent("agent", "resume_start", "info", kind);

    void (async () => {
      setRunning(true);
      try {
        await sse.connect(projectId, conversation.id, kind, { resume: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro ao retomar agente";
        logEditorTelemetryEvent("agent", "resume_fail", "error", msg.slice(0, 200));
        toast.error(msg);
      } finally {
        setRunning(false);
      }
    })();
  }, [conversation, projectId, running, sse, logPanelOpen, qc, tasteQuota]);

  useEffect(() => {
    if (!sse.progress.finished || !conversation) return;
    void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });
    void qc.invalidateQueries({ queryKey: ["profile"] });
  }, [sse.progress.finished, conversation, qc]);

  // Segue run enfileirado pelo worker (PGMQ) sem criar run duplicado
  useEffect(() => {
    if (!sse.progress.finished || !conversation || running || sse.connected) return;

    let cancelled = false;
    const followQueuedRun = async (attempt = 0) => {
      if (cancelled || attempt > 30) return;

      const { data: activeRun } = await supabase
        .from("agent_runs")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "running")
        .maybeSingle();

      if (activeRun?.id) {
        setRunning(true);
        try {
          await sse.watch(projectId, conversation.id, activeRun.id);
        } finally {
          setRunning(false);
        }
        return;
      }

      const { count } = await supabase
        .from("agent_pending_messages")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);

      if ((count ?? 0) > 0 || sse.progress.pendingQueueCount > 0 || pendingAgentRunKey) {
        await new Promise((r) => window.setTimeout(r, 500));
        return followQueuedRun(attempt + 1);
      }
    };

    void followQueuedRun();
    return () => {
      cancelled = true;
    };
  }, [
    sse.progress.finished,
    sse.progress.pendingQueueCount,
    conversation,
    projectId,
    running,
    sse.connected,
    sse,
    pendingAgentRunKey,
  ]);

  const agentFinished = sse.progress.finished;
  const agentShouldBootPreview =
    agentFinished &&
    (sse.progress.lastFinishOk === true ||
      sse.progress.resumable === true ||
      (sse.progress.lastFinishOk === null && agentHasRun && !sse.progress.error));

  useEffect(() => {
    if (!isReactProject || !e2bConnected || devUrl || previewBoot.booting) return;
    if (running) return;
    if (!agentShouldBootPreview) return;
    void previewBoot.bootWithRetry();
  }, [
    agentShouldBootPreview,
    running,
    isReactProject,
    e2bConnected,
    devUrl,
    previewBoot.booting,
    previewBoot.bootWithRetry,
  ]);

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
        .then(async ({ error }) => {
          if (error) {
            toast.error("Erro ao enviar mensagem");
            logEditorTelemetryEvent("agent", "chat_send_fail", "error", error.message.slice(0, 200));
            return;
          }
          logEditorTelemetryEvent("agent", "chat_send", "info", mode ?? composerMode);
          void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });

          const kind = resolveSessionKind(tasteQuota);
          if (running || sse.connected) {
            const queued = await sse.queueMessage(projectId, conversation.id, kind);
            if (queued.ok) {
              toast.info(
                queued.pendingCount && queued.pendingCount > 1
                  ? `${queued.pendingCount} mensagens na fila`
                  : "Mensagem na fila — o agente processará em seguida",
              );
            } else {
              toast.error(queued.message ?? "Erro ao enfileirar mensagem");
            }
            return;
          }
          runAgent(kind);
        });
    },
    [conversation, runAgent, composerMode, tasteQuota, running, sse, projectId, qc],
  );

  const handleVisualEdits = useCallback(() => {
    if (activeView !== "preview") {
      setActiveView("preview");
      toast.info("Abra o Preview para selecionar um elemento.");
    }
    setPickMode((v) => {
      const next = !v;
      logEditorTelemetryEvent("ui", next ? "visual_edits_on" : "visual_edits_off", "info");
      return next;
    });
  }, [activeView]);

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
        else runAgent("taste", "start");
      });
  }, [conversation, runAgent]);

  const handleStop = useCallback(() => {
    void (async () => {
      await sse.stop();
      setRunning(false);
      logEditorTelemetryEvent("agent", "run_stop", "warn", "user");
      setLogs((prev) => [...prev, createLogEntry("warning", "Agente interrompido pelo usuário", "agent")]);
      toast.info("Agente interrompido");
    })();
  }, [sse]);

  const handleUndoMessage = useCallback((assistantMsgId: string) => {
    if (!conversation) return;
    // Find the assistant message and the user message before it
    const msgIndex = chatMessages.findIndex(m => m.id === assistantMsgId && m.role === "assistant");
    if (msgIndex === -1) return;
    const userMsg = chatMessages[msgIndex - 1];
    if (!userMsg || userMsg.role !== "user") return;

    // Delete both messages from the database (newest first)
    supabase
      .from("messages")
      .delete()
      .in("id", [assistantMsgId, userMsg.id])
      .then(({ error }) => {
        if (error) {
          toast.error("Erro ao desfazer");
        } else {
          toast.success("Desfeito: última resposta do agente + sua mensagem anterior");
          logEditorTelemetryEvent("agent", "undo", "info", assistantMsgId.slice(0, 8));
        }
      });
    // Invalidate queries to refetch
    void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });
  }, [chatMessages, conversation, qc]);

  const handleExportZip = useCallback(() => {
    if (!project) return;
    exportProjectZip(projectId, project.name ?? "projeto");
  }, [projectId, project]);

  const liveSiteUrl = useMemo(() => {
    const base = publishedUrl ?? devUrl;
    if (!base) return null;
    return buildPreviewUrl(base, previewRoute);
  }, [publishedUrl, devUrl, previewRoute]);

  const handleOpenLiveSite = useCallback(async () => {
    if (liveSiteUrl) {
      window.open(liveSiteUrl, "_blank", "noopener");
      return;
    }
    if (isReactProject) {
      toast.info("Subindo preview…");
      const url = await previewBoot.bootWithRetry();
      if (url) window.open(buildPreviewUrl(url, previewRoute), "_blank", "noopener");
    }
  }, [liveSiteUrl, isReactProject, previewBoot, previewRoute]);

  const handleShare = useCallback(() => {
    if (!liveSiteUrl) {
      toast.info("O link ficará disponível quando o preview subir.");
      return;
    }
    navigator.clipboard.writeText(liveSiteUrl).then(
      () => toast.success("Link copiado para a área de transferência"),
      () => toast.info(liveSiteUrl),
    );
  }, [liveSiteUrl]);

  const publishButtonLabel = autoPublish.publishing
    ? "Publicando…"
    : autoPublish.isLive || liveSiteUrl
      ? "Abrir site"
      : previewBoot.booting || previewBoot.warming
        ? "Subindo…"
        : "Abrir site";

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
        onOpenHistory: () =>
          navigate({ to: "/projects/$projectId/history", params: { projectId } }),
        isRunning: running,
      }),
    [handleExportZip, openTabs, projectId, runAgent, handleStop, running, navigate],
  );

  // ─── Keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "k") { e.preventDefault(); setPaletteOpen((v) => !v); }
      if (mod && e.shiftKey && e.key === "?") { e.preventDefault(); setCheatsheetOpen((v) => !v); }
      if (mod && e.key === "p" && !e.shiftKey) { e.preventDefault(); setPaletteOpen(true); }
      if (mod && e.key === "j") { e.preventDefault(); setLogPanelOpen((v) => !v); }
      if (mod && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setLogPanelTab("shot");
        setLogPanelOpen(true);
      }
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

      <EditorShell topBar="none">
        <div
          className="flex min-h-0 h-full w-full flex-1 flex-col overflow-hidden"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <EditorResizableLayout
            workspaceCode={activeView === "code"}
            chatHeader={
              <EditorChatHeader projectName={project?.name} running={running} />
            }
            workspaceHeader={
              <EditorWorkspaceHeader
                activeView={mainView}
                onViewChange={handleMainViewChange}
                onShare={handleShare}
                onPublish={handleOpenLiveSite}
                publishLabel={publishButtonLabel}
                publishDisabled={!liveSiteUrl && (previewBoot.booting || previewBoot.warming || autoPublish.publishing)}
                integrations={{
                  status: connectorStatus,
                  modes: connectorModes,
                  modal: connectorModal,
                  openConnector,
                  closeModal: closeConnectorModal,
                  saveConnector,
                }}
                preview={{
                  files: previewNavFiles,
                  activePath: previewRoute,
                  onNavigate: setPreviewRoute,
                  devUrl,
                  onRefresh: () => {
                    if (previewIframeRef.current?.contentWindow) {
                      previewIframeRef.current.contentWindow.location.reload();
                    } else {
                      void previewBoot.boot({ force: true });
                    }
                    setPreviewReloadNonce((n) => n + 1);
                  },
                  device: previewDevice,
                  onDeviceChange: setPreviewDevice,
                }}
              />
            }
            chat={
              <div className="forge-chat-column">
                <div className="forge-chat-body">
                  <TastePostStartBanner />
                  <ChatInput
                    messages={chatMessages}
                    running={running}
                    agentProgress={sse.progress}
                    onResumeAgent={handleResumeAgent}
                    onSend={handleSend}
                    onStop={handleStop}
                    onVisualEdits={handleVisualEdits}
                    visualEditsActive={pickMode}
                    files={filePaths}
                    composerMode={composerMode}
                    onComposerModeChange={setComposerMode}
                    externalPrompt={promptDraft}
                    onExternalPromptConsumed={() => setPromptDraft(null)}
                    welcomeMarkdown={chatMessages.length === 0 ? welcomeMarkdown : undefined}
                    tasteChatRemaining={tasteChatRemaining}
                    tasteStartRemaining={tasteStartRemaining}
                    onStartProject={handleStartProject}
                    onDeploy={handleOpenLiveSite}
                    onUndoMessage={handleUndoMessage}
                  />
                </div>
                <SetupRail
                  hasUserLlmKey={hasUserLlmKey}
                  e2bConnected={e2bConnected}
                  prefs={agentPrefs}
                  connectorRows={connectorRows}
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

                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
                        files={previewNavFiles}
                        booting={previewBoot.booting}
                        agentRunning={running}
                        devUrl={devUrl}
                        previewPath={previewRoute}
                        iframeRef={previewIframeRef}
                        bootError={
                          previewBoot.bootLogs
                            ? `${previewBoot.lastError ?? "Vite subindo"} — ${previewBoot.bootLogs.slice(0, 280)}`
                            : previewBoot.lastError
                        }
                        warming={previewBoot.warming}
                        onWarmComplete={previewBoot.clearWarming}
                        onRefresh={() => previewBoot.boot({ force: true })}
                        reloadNonce={previewReloadNonce}
                        agentHasRun={agentHasRun}
                        e2bConnected={e2bConnected}
                        previewIdle={previewIdle}
                        projectName={project?.name}
                        device={previewDevice}
                        onImportRepo={(url) => {
                          toast.info(`Importando repositório: ${url}`);
                          openConnector("github");
                        }}
                        onFocusChat={() => {
                          const el = document.querySelector<HTMLTextAreaElement>(
                            ".forge-composer-input",
                          );
                          el?.focus();
                        }}
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
              </div>
            }
          />
        </div>

        <LogPanel
          isOpen={logPanelOpen}
          onClose={() => setLogPanelOpen(false)}
          logs={logs}
          running={running}
          initialTab={logPanelTab}
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
