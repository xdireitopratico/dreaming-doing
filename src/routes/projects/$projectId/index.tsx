// $projectId/index.tsx — Editor FORGE Definitivo (Fase 4 — Integração total)
import { createFileRoute, useParams, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";

import { FORGE_WELCOME_BYOK_MARKDOWN, FORGE_WELCOME_MARKDOWN } from "@/lib/welcome-message";
import { loadAgentPreferences } from "@/lib/agent-preferences";

import { useConnectors } from "@/hooks/useConnectors";
import { useTasteUiActions } from "@/hooks/useTasteUiActions";
import type { EditorMainView } from "@/components/editor/editor-views";
import type { AgentComposerMode } from "@/components/editor/ChatInput";
import type { Tab } from "@/components/editor/CodeEditor";
import type { LogEntry } from "@/components/editor/LogPanel";
import { useAgentRun } from "@/hooks/useAgentRun";
import { usePreviewBoot } from "@/hooks/usePreviewBoot";
import { usePreviewIdle } from "@/hooks/usePreviewIdle";
import { useEditorTelemetry } from "@/hooks/useEditorTelemetry";
import { useElementPicker } from "@/hooks/useElementPicker";
import { useWorkspacePresets, useFileDrop } from "@/hooks/useWorkspacePresets";
import { toast } from "sonner";
import type { editor } from "monaco-editor";

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
  const [composerMode, setComposerMode] = useState<AgentComposerMode>("plan");
  const [promptDraft, setPromptDraft] = useState<string | null>(null);
  const [previewRoute, setPreviewRoute] = useState("/");
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

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
    fileTreeFiles,
    previewNavFiles,
    isReactProject,
    agentHasRun,
    pendingAgentRunKey,
    devUrl,
    publishedUrl,
    previewReady,
  } = pageData;

  const { idle: previewIdle } = usePreviewIdle(activeView === "preview" && !!devUrl);
  const previewBoot = usePreviewBoot(projectId, {
    idle: previewIdle,
    watchHealth: activeView === "preview" && !!devUrl && (files?.length ?? 0) > 0,
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
  });

  useEffect(() => {
    for (const m of chatMessages) {
      if (m.role === "assistant" && m.runId) {
        agent.acknowledgeMaterializedRun(m.runId);
      }
    }
  }, [chatMessages, agent]);

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
    onPick: (el) => {
      toast.success(`Elemento: ${el.selector}`);
      setPickMode(false);
    },
    active: pickMode,
    onToggle: () => setPickMode(!pickMode),
  });

  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } = useFileDrop(
    (files) =>
      toast.info(
        `${files.length} arquivo${files.length !== 1 ? "s" : ""} recebido${files.length !== 1 ? "s" : ""}`,
      ),
  );

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
      projectName={project?.name}
      running={running}
      agent={agent}
      mainView={mainView}
      onMainViewChange={handleMainViewChange}
      handleShare={handlers.handleShare}
      handleOpenLiveSite={handlers.handleOpenLiveSite}
      publishButtonLabel={handlers.publishButtonLabel}
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
      welcomeMarkdown={welcomeMarkdown}
      tasteChatRemaining={tasteChatRemaining}
      tasteStartRemaining={tasteStartRemaining}
      handleStartProject={handlers.handleStartProject}
      handleUndoMessage={handlers.handleUndoMessage}
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
      previewReloadNonce={previewReloadNonce}
      diffEntries={orchestration.diffEntries}
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
    />
  );
}