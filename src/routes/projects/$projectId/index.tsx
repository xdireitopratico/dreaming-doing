// $projectId/index.tsx — Editor FORGE Definitivo (Fase 4 — Integração total)
import { createFileRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadAgentPreferences } from "@/lib/agent-preferences";

import { useConnectors } from "@/hooks/useConnectors";
import { useTasteUiActions } from "@/hooks/useTasteUiActions";
import type { EditorMainView } from "@/components/editor/editor-views";
import type { AgentComposerMode } from "@/lib/chat-types";
import { loadComposerMode, saveComposerMode } from "@/lib/composer-mode";
import type { Tab } from "@/components/editor/CodeEditor";
import type { LogEntry } from "@/components/editor/LogPanel";
import { useAgentRun } from "@/hooks/useAgentRun";
import { usePreviewBoot } from "@/hooks/usePreviewBoot";
import { usePreviewIdle } from "@/hooks/usePreviewIdle";
import { useEditorTelemetry } from "@/hooks/useEditorTelemetry";
import { useElementPicker } from "@/hooks/useElementPicker";
import { useFileDrop, useWorkspacePresets } from "@/hooks/useWorkspacePresets";

import type { editor } from "monaco-editor";

import { useIsMobile } from "@/hooks/use-mobile";
import type { EditorMobilePanel } from "@/components/editor/EditorMobileHeader";
import { useEditorPageData } from "./useEditorPageData";
import { useEditorPageHandlers } from "./useEditorPageHandlers";
import { useEditorAgentOrchestration } from "./useEditorAgentOrchestration";
import { EditorPageLayout } from "./EditorPageLayout";

export const Route = createFileRoute("/projects/$projectId/")({
  component: EditorPage,
  validateSearch: (search: Record<string, unknown>) => {
    const replay = typeof search.replay === "string" ? search.replay : undefined;
    return replay ? { replay } : {};
  },
});

function EditorPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/" });
  const navigate = useNavigate();
  const search = useSearch({ from: "/projects/$projectId/" });
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

  const e2bConnected = connectorStatus.e2b.connected;
  useTasteUiActions();
  const tasteQuota = useMemo(
    () => ({
      tasteChatRemaining,
      tasteStartRemaining,
      hasUserLlmKey,
    }),
    [tasteChatRemaining, tasteStartRemaining, hasUserLlmKey],
  );

  const isMobile = useIsMobile();
  const [mobilePanel, setMobilePanel] = useState<EditorMobilePanel>("chat");

  const handleMobilePanelChange = useCallback((panel: EditorMobilePanel) => {
    setMobilePanel(panel);
    if (panel === "code") setActiveView("code");
    else if (panel === "preview") setActiveView("preview");
  }, []);
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
  const [pickMode, setPickMode] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [composerMode, setComposerModeState] = useState<AgentComposerMode>(() =>
    loadComposerMode(projectId),
  );

  const setComposerMode = useCallback(
    (value: AgentComposerMode | ((prev: AgentComposerMode) => AgentComposerMode)) => {
      setComposerModeState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        saveComposerMode(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  useEffect(() => {
    setComposerModeState(loadComposerMode(projectId));
  }, [projectId]);
  const [promptDraft, setPromptDraft] = useState<string | null>(null);
  const [previewRoute, setPreviewRoute] = useState("/");
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [reviewedDiffs, setReviewedDiffs] = useState<Record<string, "accept" | "reject">>({});

  const markDiffReviewed = useCallback((diffId: string, decision: "accept" | "reject") => {
    setReviewedDiffs((prev) => ({ ...prev, [diffId]: decision }));
  }, []);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

  const agent = useAgentRun();
  useWorkspacePresets();

  const pageData = useEditorPageData({
    projectId,
    search,
    agent,
    navigate,
  });

  const {
    project,
    conversation,
    messages,
    files,
    filePaths,
    fileMap,
    chatMessages,
    chatMessagesLoading,
    fileTreeFiles,
    previewNavFiles,
    isReactProject,
    projectStack,
    nativeBuildPreview,
    agentHasRun,
    devUrl,
    publishedUrl,
    previewReady,
  } = pageData;

  const { idle: previewIdle } = usePreviewIdle(activeView === "preview" && !!devUrl);
  const previewBoot = usePreviewBoot(projectId, {
    idle: previewIdle,
    watchHealth: activeView === "preview" && !!devUrl && (files?.length ?? 0) > 0,
    fileCount: files?.length ?? 0,
  });

  const handlers = useEditorPageHandlers({
    projectId,
    project,
    conversation,
    agent,
    qc: pageData.qc,
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
  });

  // Defensive invalidate (single source post-terminal path) for messages on activeRunId clear or
  // finished transitions — complements orchestration/coordinator; ensures buildChatThread sees
  // latest DB assistants for anchoring (multi-turn, no mismatch after second msg).
  useEffect(() => {
    if (!pageData.qc || !conversation?.id) return;
    if (agent.progress.finished || !agent.activeRunId) {
      void pageData.qc.invalidateQueries({
        queryKey: ["messages", conversation.id],
      });
    }
  }, [agent.progress.finished, agent.activeRunId, conversation?.id, pageData.qc]);

  const orchestration = useEditorAgentOrchestration({
    projectId,
    conversation,
    files,
    agent,
    qc: pageData.qc,
    running,
    setRunning,
    logs,
    setLogs,
    logPanelOpen,
    setLogPanelOpen,
    e2bConnected,
    isReactProject,
    nativeBuildPreview,
    agentHasRun,
    devUrl,
    activeView,
    setPreviewReloadNonce,
    tasteQuota,
    runAgent: handlers.runAgent,
    fileMap,
    editorRef,
    monacoRef,
    previewBoot,
    previewIdle,
    reviewedDiffs,
  });

  useEffect(() => {
    if (activeView === "code") setShowFileTree(true);
  }, [activeView]);

  const mainView: EditorMainView = activeView === "code" ? "code" : "preview";
  const handleMainViewChange = useCallback((view: EditorMainView) => {
    setActiveView(view);
  }, []);

  useElementPicker({
    iframeRef: previewIframeRef,
    onPick: () => {
      setPickMode(false);
    },
    active: pickMode,
    onToggle: () => setPickMode(!pickMode),
  });

  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } = useFileDrop(() => {});

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
          agentConnected: agent.connected,
          agentProgress: agent.progress,
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

  return (
    <EditorPageLayout
      projectId={projectId}
      conversationId={conversation?.id ?? null}
      projectName={project?.name}
      running={running}
      agent={agent}
      mainView={mainView}
      onMainViewChange={handleMainViewChange}
      handleShare={handlers.handleShare}
      handleOpenLiveSite={handlers.handleOpenLiveSite}
      publishButtonLabel={handlers.publishButtonLabel}
      contentPublishReady={handlers.contentPublishReady}
      liveSiteUrl={handlers.liveSiteUrl}
      previewBoot={previewBoot}
      autoPublishPublishing={handlers.autoPublish.publishing}
      connectorStatus={connectorStatus}
      connectorModes={connectorModes}
      connectorModal={connectorModal}
      openConnector={openConnector}
      closeConnectorModal={closeConnectorModal}
      saveConnector={saveConnector}
      previewNavFiles={previewNavFiles}
      previewRoute={previewRoute}
      setPreviewRoute={setPreviewRoute}
      devUrl={devUrl}
      previewIframeRef={previewIframeRef}
      setPreviewReloadNonce={setPreviewReloadNonce}
      previewDevice={previewDevice}
      setPreviewDevice={setPreviewDevice}
      e2bConnected={e2bConnected}
      chatMessages={chatMessages}
      chatMessagesLoading={chatMessagesLoading}
      handleResumeAgent={handlers.handleResumeAgent}
      handleSend={handlers.handleSend}
      handleStop={handlers.handleStop}
      handleVisualEdits={handlers.handleVisualEdits}
      pickMode={pickMode}
      filePaths={filePaths}
      composerMode={composerMode}
      setComposerMode={setComposerMode}
      promptDraft={promptDraft}
      setPromptDraft={setPromptDraft}
      handleRollbackMessage={handlers.handleRollbackMessage}
      handlePlanApprove={handlers.handlePlanApprove}
      handlePlanReject={handlers.handlePlanReject}
      hasUserLlmKey={hasUserLlmKey}
      agentPrefs={agentPrefs}
      connectorRows={connectorRows}
      showFileTree={showFileTree}
      activeView={activeView}
      fileTreeFiles={fileTreeFiles}
      activeFilePath={activeFilePath}
      handleSelectFile={handlers.handleSelectFile}
      openTabs={openTabs}
      handleCloseTab={handlers.handleCloseTab}
      handleContentChange={handlers.handleContentChange}
      previewIdle={previewIdle}
      agentHasRun={agentHasRun}
      isReactProject={isReactProject}
      projectStack={projectStack}
      nativeBuildPreview={nativeBuildPreview}
      previewReloadNonce={previewReloadNonce}
      previewSyncing={orchestration.previewSyncing}
      previewLiveUpdating={orchestration.previewLiveUpdating}
      diffEntries={orchestration.diffEntries}
      handleDiffAccept={handlers.handleDiffAccept}
      handleDiffReject={handlers.handleDiffReject}
      handleDiffAcceptAll={handlers.handleDiffAcceptAll}
      handleDiffRejectAll={handlers.handleDiffRejectAll}
      logPanelOpen={logPanelOpen}
      setLogPanelOpen={setLogPanelOpen}
      logs={logs}
      logPanelTab={logPanelTab}
      paletteOpen={paletteOpen}
      setPaletteOpen={setPaletteOpen}
      paletteActions={handlers.paletteActions}
      cheatsheetOpen={cheatsheetOpen}
      setCheatsheetOpen={setCheatsheetOpen}
      isDragOver={isDragOver}
      handleDragOver={handleDragOver}
      handleDragLeave={handleDragLeave}
      handleDrop={handleDrop}
      isMobile={isMobile}
      mobilePanel={mobilePanel}
      onMobilePanelChange={handleMobilePanelChange}
    />
  );
}
