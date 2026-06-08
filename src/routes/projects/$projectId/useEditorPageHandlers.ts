import { useCallback, useEffect, useMemo } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { NavigateOptions } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import type { Tab } from "@/components/editor/CodeEditor";
import type { AgentComposerMode } from "@/components/editor/ChatInput";
import type { ChatMessage } from "@/components/editor/ChatInput";
import { buildEditorActions, type PaletteAction } from "@/components/editor/CommandPalette";
import { createLogEntry, type LogEntry } from "@/components/editor/LogPanel";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import {
  isAgentPreferencesConfigured,
  getAgentSetupBlockMessage,
} from "@/lib/agent-setup";
import type { ForgeSessionKind, TasteAction } from "@/lib/taste";
import {
  canSendTasteChat,
  canStartTasteProject,
  resolveSessionKind,
} from "@/lib/taste";
import type { StoredMessagePart } from "@/lib/chat-attachments";
import { buildPreviewUrl } from "@/lib/project-routes";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { isAgentConnectInFlight } from "@/lib/agent-session-guards";
import { loadAgentSessionExtensions } from "@/lib/agent-session-extensions";
import { publishProject } from "@/lib/publish.functions";
import { planApprove, planReject } from "@/lib/plan-decide.functions";
import { resolvePendingPlan } from "@/lib/plan-message-meta";
import type { PendingPlan } from "@/lib/agent-progress";
import { exportProjectZip } from "@/hooks/useWorkspacePresets";
import { useAutoPublish } from "@/hooks/useAutoPublish";
import { isProjectPublishReady } from "@/lib/publish-ready";
import type { ProjectStackKind } from "@/lib/detect-project-kind";
import type { useAgentRun } from "@/hooks/useAgentRun";
import type { usePreviewBoot } from "@/hooks/usePreviewBoot";
import { toast } from "@/lib/toast";
import {
  FORGE_UI_BUNDLED_MARKER,
  bundledMarkerContent,
  isForgeUiBundlePath,
} from "@/lib/file-tree-display";

type AgentRun = ReturnType<typeof useAgentRun>;
type PreviewBoot = ReturnType<typeof usePreviewBoot>;

type TasteQuota = {
  tasteChatRemaining: number;
  tasteStartRemaining: number;
  hasUserLlmKey: boolean;
};

type UseEditorPageHandlersParams = {
  projectId: string;
  project: { name?: string | null } | null | undefined;
  conversation: { id: string } | null | undefined;
  agent: AgentRun;
  qc: QueryClient;
  navigate: (options: NavigateOptions) => void;
  tasteQuota: TasteQuota;
  fileMap: Map<string, string>;
  filePaths: string[];
  files: Array<{ path: string; content?: string }> | undefined;
  projectStack: ProjectStackKind | null;
  chatMessages: ChatMessage[];
  isReactProject: boolean;
  devUrl: string | null;
  publishedUrl: string | null;
  previewReady: boolean;
  e2bConnected: boolean;
  previewBoot: PreviewBoot;
  running: boolean;
  activeView: "code" | "preview" | "diff";
  setActiveView: (value: "code" | "preview" | "diff" | ((prev: "code" | "preview" | "diff") => "code" | "preview" | "diff")) => void;
  activeFilePath: string | null;
  setActiveFilePath: (value: string | null | ((prev: string | null) => string | null)) => void;
  openTabs: Tab[];
  setOpenTabs: (value: Tab[] | ((prev: Tab[]) => Tab[])) => void;
  composerMode: AgentComposerMode;
  setComposerMode: (value: AgentComposerMode | ((prev: AgentComposerMode) => AgentComposerMode)) => void;
  logPanelOpen: boolean;
  setLogPanelOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  setLogPanelTab: (value: "terminal" | "console" | "problems" | "shot" | ((prev: "terminal" | "console" | "problems" | "shot") => "terminal" | "console" | "problems" | "shot")) => void;
  setLogs: (value: LogEntry[] | ((prev: LogEntry[]) => LogEntry[])) => void;
  setShowFileTree: (value: boolean | ((prev: boolean) => boolean)) => void;
  setPaletteOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  setCheatsheetOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  setPickMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  previewRoute: string;
  markDiffReviewed: (diffId: string, decision: "accept" | "reject") => void;
  reviewedDiffs: Record<string, "accept" | "reject">;
};

export function useEditorPageHandlers({
  projectId,
  project,
  conversation,
  agent,
  qc,
  navigate,
  tasteQuota,
  fileMap,
  filePaths,
  files,
  projectStack,
  chatMessages,
  isReactProject,
  devUrl,
  publishedUrl,
  previewReady,
  e2bConnected,
  previewBoot,
  running,
  activeView,
  setActiveView,
  activeFilePath,
  setActiveFilePath,
  openTabs,
  setOpenTabs,
  composerMode,
  setComposerMode,
  logPanelOpen,
  setLogPanelOpen,
  setLogPanelTab,
  setLogs,
  setShowFileTree,
  setPaletteOpen,
  setCheatsheetOpen,
  setPickMode,
  previewRoute,
  markDiffReviewed,
  reviewedDiffs,
}: UseEditorPageHandlersParams) {
  const publishFn = useServerFn(publishProject);
  const planApproveFn = useServerFn(planApprove);
  const planRejectFn = useServerFn(planReject);

  const contentPublishReady = useMemo(
    () => isProjectPublishReady(files ?? [], projectStack),
    [files, projectStack],
  );

  const autoPublish = useAutoPublish({
    projectId,
    devUrl,
    publishedUrl,
    previewReady,
    contentPublishReady,
    enabled: isReactProject && e2bConnected,
    booting: previewBoot.booting,
    warming: previewBoot.warming,
    publishFn,
  });

  const handleSelectFile = useCallback(
    (path: string) => {
      if (isForgeUiBundlePath(path) && path !== FORGE_UI_BUNDLED_MARKER) {
        path = FORGE_UI_BUNDLED_MARKER;
      }
      const content =
        path === FORGE_UI_BUNDLED_MARKER
          ? bundledMarkerContent()
          : (fileMap.get(path) ?? "");
      setActiveFilePath(path);
      if (activeView === "diff") setActiveView("code");
      setOpenTabs((prev) => {
        if (prev.some((t) => t.path === path)) return prev;
        return [...prev, { path, content, isModified: false }];
      });
    },
    [fileMap, activeView, setActiveFilePath, setActiveView, setOpenTabs],
  );

  const handleCloseTab = useCallback(
    (path: string) => {
      setOpenTabs((prev) => {
        const next = prev.filter((t) => t.path !== path);
        if (activeFilePath === path) {
          setActiveFilePath(next.length > 0 ? next[next.length - 1].path : null);
        }
        return next;
      });
    },
    [activeFilePath, setActiveFilePath, setOpenTabs],
  );

  const handleContentChange = useCallback(
    (path: string, content: string) => {
      setOpenTabs((prev) =>
        prev.map((t) => (t.path === path ? { ...t, content, isModified: true } : t)),
      );
    },
    [setOpenTabs],
  );

  const isAgentBusy = useCallback(
    () => running || agent.connected || isAgentConnectInFlight(),
    [running, agent.connected],
  );

  const runAgent = useCallback(
    (explicitKind?: ForgeSessionKind, explicitAction?: TasteAction): boolean => {
      if (!conversation || isAgentBusy()) return false;

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
            : agent.progress.resumable
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
        try {
          await agent.connect(projectId, conversation.id, kind, { tasteAction, mode: composerMode });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Erro ao iniciar agente";
          logEditorTelemetryEvent("agent", "run_fail", "error", msg.slice(0, 200));
        }
      })();
      return true;
    },
    [
      conversation,
      projectId,
      isAgentBusy,
      agent,
      logPanelOpen,
      qc,
      agent.progress.resumable,
      tasteQuota,
      composerMode,
      setLogs,
      setLogPanelOpen,
    ],
  );

  const handleResumeAgent = useCallback(() => {
    if (!conversation || isAgentBusy()) return;

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
      try {
        await agent.connect(projectId, conversation.id, kind, { resume: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro ao retomar agente";
        logEditorTelemetryEvent("agent", "resume_fail", "error", msg.slice(0, 200));
      }
    })();
  }, [conversation, projectId, isAgentBusy, agent, logPanelOpen, qc, tasteQuota, setLogs, setLogPanelOpen]);

  const handleSend = useCallback(
    async (text: string, mode?: AgentComposerMode, parts?: StoredMessagePart[]) => {
      if (!conversation) {
        toast.error("Conversa ainda carregando — tente de novo em instantes.");
        return;
      }

      const pp = resolvePendingPlan(agent.progress.pendingPlan, chatMessages);
      if (pp) {
        try {
          await planRejectFn({
            data: {
              runId: pp.runId,
              planId: pp.planId,
              reason: "Nova mensagem — plano ignorado",
            },
          });
          agent.clearPendingPlan();
          qc.invalidateQueries({ queryKey: ["conversation", projectId] });
          qc.invalidateQueries({ queryKey: ["agent-runs", projectId] });
        } catch (e) {
          toast.error((e as Error)?.message ?? "Falha ao ignorar plano pendente");
          return;
        }
      }

      const messageParts =
        parts && parts.length > 0
          ? parts
          : [
              {
                type: "text" as const,
                text,
              },
            ];

      const { error } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "user",
        parts: messageParts,
      });

      if (error) {
        toast.error("Erro ao enviar mensagem");
        logEditorTelemetryEvent("agent", "chat_send_fail", "error", error.message.slice(0, 200));
        return;
      }

      logEditorTelemetryEvent("agent", "chat_send", "info", mode ?? composerMode);
      void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });

      const kind = resolveSessionKind(tasteQuota);
      if (isAgentBusy()) {
        const queued = await agent.queueMessage(projectId, conversation.id, kind);
        if (!queued.ok) {
          toast.error(queued.message ?? "Erro ao enfileirar mensagem");
        }
        return;
      }
      runAgent(kind);
    },
    [
      conversation,
      runAgent,
      composerMode,
      tasteQuota,
      isAgentBusy,
      agent,
      projectId,
      qc,
      planRejectFn,
      chatMessages,
    ],
  );

  const handleVisualEdits = useCallback(() => {
    if (activeView !== "preview") {
      setActiveView("preview");
    }
    setPickMode((v) => {
      const next = !v;
      logEditorTelemetryEvent("ui", next ? "visual_edits_on" : "visual_edits_off", "info");
      return next;
    });
  }, [activeView, setActiveView, setPickMode]);

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
      await agent.stop();
      logEditorTelemetryEvent("agent", "run_stop", "warn", "user");
      setLogs((prev) => [...prev, createLogEntry("warning", "Agente interrompido pelo usuário", "agent")]);
    })();
  }, [agent, setLogs]);

  const handleUndoMessage = useCallback(
    (assistantMsgId: string) => {
      if (!conversation) {
        toast.error("Conversa ainda carregando — tente de novo em instantes.");
        return;
      }
      const msgIndex = chatMessages.findIndex(
        (m) => m.id === assistantMsgId && m.role === "assistant",
      );
      if (msgIndex === -1) return;
      const userMsg = chatMessages[msgIndex - 1];
      if (!userMsg || userMsg.role !== "user") return;

      supabase
        .from("messages")
        .delete()
        .in("id", [assistantMsgId, userMsg.id])
        .then(({ error }) => {
          if (error) {
            toast.error("Erro ao desfazer");
          } else {
            logEditorTelemetryEvent("agent", "undo", "info", assistantMsgId.slice(0, 8));
          }
        });
      void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });
    },
    [chatMessages, conversation, qc],
  );

  const handleExportZip = useCallback(() => {
    if (!project) return;
    exportProjectZip(projectId, project.name ?? "projeto");
  }, [projectId, project]);

  const getPendingPlan = useCallback((): PendingPlan | null => {
    return resolvePendingPlan(agent.progress.pendingPlan, chatMessages);
  }, [agent.progress.pendingPlan, chatMessages]);

  const handlePlanApprove = useCallback(
    async (steps: { id: string; enabled: boolean }[], markdown?: string) => {
      const pp = getPendingPlan();
      if (!pp) {
        toast.error("Plano não encontrado — gere um novo plano no modo Plan.");
        return;
      }
      const enabled = steps.filter((s) => s.enabled !== false);
      if (enabled.length === 0) {
        toast.error("Selecione ao menos um passo para executar.");
        return;
      }
      const full = enabled
        .map((s) => pp.steps.find((p) => p.id === s.id))
        .filter((s): s is NonNullable<typeof s> => s != null);
      if (full.length === 0) {
        toast.error("Passos selecionados não correspondem ao plano.");
        return;
      }

      const prefs = loadAgentPreferences();
      const sessionKind = resolveSessionKind(tasteQuota);
      if (sessionKind === "byok" && !isAgentPreferencesConfigured(prefs)) {
        toast.error(getAgentSetupBlockMessage(prefs));
        return;
      }
      const { enabledSkillIds, enabledMcpIds } = loadAgentSessionExtensions();

      try {
        const result = await planApproveFn({
          data: {
            runId: pp.runId,
            planId: pp.planId,
            plan: markdown?.trim() || pp.summary,
            steps: full,
            preferences: prefs,
            sessionKind,
            enabledSkillIds,
            enabledMcpIds,
          },
        });
        setComposerMode("build");
        agent.clearPendingPlan();
        await qc.invalidateQueries({ queryKey: ["conversation", projectId] });
        await qc.invalidateQueries({ queryKey: ["messages", conversation?.id] });
        qc.invalidateQueries({ queryKey: ["agent-runs", projectId] });
        if (result.newRunId && conversation) {
          const pendingKey = `forge:pending-build-run:${projectId}`;
          try {
            sessionStorage.setItem(pendingKey, result.newRunId);
            await agent.watch(projectId, conversation.id, result.newRunId);
            sessionStorage.removeItem(pendingKey);
          } catch (watchErr) {
            logEditorTelemetryEvent(
              "agent",
              "plan_approve_watch_fail",
              "warn",
              watchErr instanceof Error ? watchErr.message.slice(0, 120) : "watch failed",
            );
          }
        }
      } catch (e) {
        toast.error((e as Error)?.message ?? "Falha ao aprovar plano");
      }
    },
    [getPendingPlan, conversation, projectId, qc, planApproveFn, setComposerMode, agent, tasteQuota],
  );

  const handlePlanReject = useCallback(
    async (reason?: string) => {
      const pp = getPendingPlan();
      if (!pp) {
        toast.error("Plano não encontrado.");
        return;
      }
      try {
        await planRejectFn({
          data: { runId: pp.runId, planId: pp.planId, reason },
        });
        await qc.invalidateQueries({ queryKey: ["messages", conversation?.id] });
        qc.invalidateQueries({ queryKey: ["conversation", projectId] });
        qc.invalidateQueries({ queryKey: ["agent-runs", projectId] });
        agent.clearPendingPlan();
      } catch (e) {
        toast.error((e as Error)?.message ?? "Falha ao rejeitar plano");
      }
    },
    [agent, getPendingPlan, conversation?.id, projectId, qc, planRejectFn],
  );

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
      const url = await previewBoot.bootWithRetry();
      if (url) window.open(buildPreviewUrl(url, previewRoute), "_blank", "noopener");
    }
  }, [liveSiteUrl, isReactProject, previewBoot, previewRoute]);

  const handleShare = useCallback(() => {
    if (!liveSiteUrl) return;
    void navigator.clipboard.writeText(liveSiteUrl).catch(() => {
      toast.error("Não foi possível copiar o link");
    });
  }, [liveSiteUrl]);

  const publishButtonLabel = autoPublish.publishing
    ? "Publicando…"
    : autoPublish.isLive || liveSiteUrl
      ? "Abrir site"
      : !contentPublishReady
        ? "Aguardando app"
        : previewBoot.booting || previewBoot.warming
          ? "Subindo…"
          : "Abrir site";

  const paletteActions: PaletteAction[] = useMemo(
    () =>
      buildEditorActions({
        onNewFile: () => {},
        onNewFolder: () => {},
        onTogglePreview: () => setActiveView((v) => (v === "preview" ? "code" : "preview")),
        onToggleTerminal: () => setLogPanelOpen((v) => !v),
        onToggleGit: () => {},
        onExportZip: handleExportZip,
        onImportFiles: () => {},
        onSaveAll: () => {
          openTabs.forEach((t) => {
            if (t.isModified && t.path) {
              supabase
                .from("project_files")
                .upsert({ project_id: projectId, path: t.path, content: t.content })
                .then(() => {
                  setOpenTabs((prev) =>
                    prev.map((pt) => (pt.path === t.path ? { ...pt, isModified: false } : pt)),
                  );
                });
            }
          });
        },
        onRunAgent: runAgent,
        onStopAgent: handleStop,
        onToggleFileTree: () => setShowFileTree((v) => !v),
        onToggleDeviceFrame: () => {},
        onOpenHistory: () =>
          navigate({ to: "/projects/$projectId/history", params: { projectId } }),
        isRunning: running,
      }),
    [
      handleExportZip,
      openTabs,
      projectId,
      runAgent,
      handleStop,
      running,
      navigate,
      setActiveView,
      setLogPanelOpen,
      setOpenTabs,
      setShowFileTree,
    ],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (mod && e.shiftKey && e.key === "?") {
        e.preventDefault();
        setCheatsheetOpen((v) => !v);
      }
      if (mod && e.key === "p" && !e.shiftKey) {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (mod && e.key === "j") {
        e.preventDefault();
        setLogPanelOpen((v) => !v);
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setLogPanelTab("shot");
        setLogPanelOpen(true);
      }
      if (mod && e.key === "b") {
        e.preventDefault();
        setShowFileTree((v) => !v);
      }
      if (mod && e.key === "s") {
        e.preventDefault();
        paletteActions.find((a) => a.id === "save-all")?.action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    paletteActions,
    setPaletteOpen,
    setCheatsheetOpen,
    setLogPanelOpen,
    setLogPanelTab,
    setShowFileTree,
  ]);

  const handleDiffAccept = useCallback(
    (diffId: string) => {
      markDiffReviewed(diffId, "accept");
      logEditorTelemetryEvent("diff", "accept", "info", diffId.slice(0, 16));
    },
    [markDiffReviewed],
  );

  const handleDiffReject = useCallback(
    async (diffId: string) => {
      const diff = agent.progress.diffs.find((d) => d.id === diffId);
      if (!diff) return;

      const { error } = await supabase.from("project_files").upsert({
        project_id: projectId,
        path: diff.path,
        content: diff.before,
      });

      if (error) {
        toast.error("Erro ao reverter arquivo");
        return;
      }

      markDiffReviewed(diffId, "reject");
      logEditorTelemetryEvent("diff", "reject", "info", diffId.slice(0, 16));
      await qc.invalidateQueries({ queryKey: ["files", projectId] });
      void previewBoot.boot({ force: true });
    },
    [agent.progress.diffs, projectId, qc, previewBoot, markDiffReviewed],
  );

  const handleDiffAcceptAll = useCallback(() => {
    const pending = agent.progress.diffs.filter((d) => !reviewedDiffs[d.id]);
    for (const d of pending) markDiffReviewed(d.id, "accept");
    logEditorTelemetryEvent("diff", "accept_all", "info", String(pending.length));
  }, [agent.progress.diffs, markDiffReviewed, reviewedDiffs]);

  const handleDiffRejectAll = useCallback(async () => {
    const pending = agent.progress.diffs.filter((d) => !reviewedDiffs[d.id]);
    if (pending.length === 0) return;

    const upserts = pending.map((d) => ({
      project_id: projectId,
      path: d.path,
      content: d.before,
    }));

    const { error } = await supabase.from("project_files").upsert(upserts);

    if (error) {
      toast.error("Erro ao reverter arquivos");
      return;
    }

    for (const d of pending) markDiffReviewed(d.id, "reject");
    logEditorTelemetryEvent("diff", "reject_all", "info", String(pending.length));
    await qc.invalidateQueries({ queryKey: ["files", projectId] });
    void previewBoot.boot({ force: true });
  }, [agent.progress.diffs, projectId, qc, previewBoot, markDiffReviewed, reviewedDiffs]);

  return {
    runAgent,
    handleSelectFile,
    handleCloseTab,
    handleContentChange,
    handleResumeAgent,
    handleSend,
    handleVisualEdits,
    handleStartProject,
    handleStop,
    handleUndoMessage,
    handleExportZip,
    handlePlanApprove,
    handlePlanReject,
    handleDiffAccept,
    handleDiffReject,
    handleDiffAcceptAll,
    handleDiffRejectAll,
    handleOpenLiveSite,
    handleShare,
    liveSiteUrl,
    publishButtonLabel,
    contentPublishReady,
    paletteActions,
    autoPublish,
  };
}