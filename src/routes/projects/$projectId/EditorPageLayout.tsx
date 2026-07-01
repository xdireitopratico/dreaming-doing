import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorShell } from "@/components/EditorShell";
import { EditorResizableLayout } from "@/components/editor/EditorResizableLayout";
import { EditorChatHeader } from "@/components/editor/EditorChatHeader";
import {
  EditorMobileHeader,
  EditorMobileTabBar,
  type EditorMobilePanel,
} from "@/components/editor/EditorMobileHeader";
import { EditorWorkspaceHeader } from "@/components/editor/EditorWorkspaceHeader";
import type { EditorMainView } from "@/components/editor/editor-views";
import type { AgentComposerMode } from "@/lib/chat-types";
import { CodeEditor, type Tab } from "@/components/editor/CodeEditor";
import { FileTree } from "@/components/editor/FileTree";
import { ChatPanel } from "@/components/chat/ChatPanel";
import type { ChatMessage } from "@/lib/chat-types";
import { TastePostStartBanner } from "@/components/editor/TastePostStartBanner";
import { OPEN_CONNECTOR_EVENT } from "@/hooks/useTasteUiActions";
import type { ConnectorId } from "@/lib/connectors/integration-prefs";
import { PreviewFrame } from "@/components/editor/PreviewFrame";
import { StackHonestBanner } from "@/components/editor/StackHonestBanner";
import { CommandPalette, type PaletteAction } from "@/components/editor/CommandPalette";
import { ShortcutCheatsheet } from "@/components/editor/ShortcutCheatsheet";
import { type LogEntry, LogPanel } from "@/components/editor/LogPanel";
import { AiDiffViewer, type DiffEntry } from "@/components/editor/AiDiffViewer";
import { usePendingPlan } from "@/hooks/usePendingPlan";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";

import { resolveInspectorRunProgress } from "@/lib/assistant-run-progress";
import { resolveInspectorPlanForRun } from "@/lib/plan-message-meta";
import type { AgentProgress } from "@/lib/agent-progress";
import { VisualEditorPanel } from "@/components/editor/visual-editor/VisualEditorPanel";
import type { useVisualEditor } from "@/hooks/useVisualEditor";
import { useJobWorkspaceFocus } from "@/hooks/useJobWorkspaceFocus";
import { JobInspector } from "@/components/editor/JobInspector";
import type { useAgentRun } from "@/hooks/useAgentRun";
import { useActiveRun } from "@/hooks/useActiveRun";
import type { usePreviewBoot } from "@/hooks/usePreviewBoot";
import type { useConnectors } from "@/hooks/useConnectors";
import type { AgentPreferences } from "@/lib/agent-preferences";
import { HEAT_MAP_CSS } from "@/lib/monacoEnhancements";

type AgentRun = ReturnType<typeof useAgentRun>;
type PreviewBoot = ReturnType<typeof usePreviewBoot>;
type Connectors = ReturnType<typeof useConnectors>;

export type EditorPageLayoutProps = {
  projectId: string;
  conversationId?: string | null;
  projectName?: string | null;
  running: boolean;
  agent: AgentRun;
  mainView: EditorMainView;
  onMainViewChange: (view: EditorMainView) => void;
  handleShare: () => void;
  handleOpenLiveSite: () => void;
  publishButtonLabel: string;
  contentPublishReady?: boolean;
  liveSiteUrl: string | null;
  previewBoot: PreviewBoot;
  autoPublishPublishing: boolean;
  connectorStatus: Connectors["status"];
  connectorModes: Connectors["modes"];
  connectorModal: Connectors["modal"];
  openConnector: Connectors["openConnector"];
  closeConnectorModal: Connectors["closeModal"];
  saveConnector: Connectors["saveConnector"];
  previewNavFiles: Array<{ path: string; content: string }>;
  previewRoute: string;
  setPreviewRoute: (path: string) => void;
  devUrl: string | null;
  previewIframeRef: RefObject<HTMLIFrameElement | null>;
  setPreviewReloadNonce: (value: number | ((prev: number) => number)) => void;
  previewDevice: "desktop" | "tablet" | "mobile";
  setPreviewDevice: (device: "desktop" | "tablet" | "mobile") => void;
  e2bConnected: boolean;
  chatMessages: ChatMessage[];
  chatMessagesLoading?: boolean;
  handleResumeAgent: () => void;
  handleSend: (
    text: string,
    mode?: AgentComposerMode,
    parts?: import("@/lib/chat-attachments").StoredMessagePart[],
  ) => void;
  handleStop: () => void;
  handleVisualEdits: () => void;
  pickMode: boolean;
  visualEditor: ReturnType<typeof useVisualEditor>;
  onVisualEditorCancel: () => void;
  onTogglePickMode: () => void;
  filePaths: string[];
  composerMode: AgentComposerMode;
  setComposerMode: (mode: AgentComposerMode) => void;
  promptDraft: string | null;
  setPromptDraft: (value: string | null) => void;
  handleRollbackMessage: (
    messageId: string,
    role: "user" | "assistant",
  ) => Promise<{ ok: boolean; error?: string }>;
  handlePlanApprove: (
    steps: { id: string; enabled: boolean }[],
    markdown?: string,
  ) => Promise<void>;
  handlePlanReject: (reason?: string) => Promise<void>;
  hasUserLlmKey: boolean;
  agentPrefs: AgentPreferences;
  connectorRows: Connectors["rows"];
  showFileTree: boolean;
  activeView: "code" | "preview" | "diff";
  fileTreeFiles: string[];
  activeFilePath: string | null;
  handleSelectFile: (path: string) => void;
  openTabs: Tab[];
  handleCloseTab: (path: string) => void;
  handleContentChange: (path: string, content: string) => void;
  previewIdle: boolean;
  agentHasRun: boolean;
  isReactProject: boolean;
  projectStack?: import("@/lib/detect-project-kind").ProjectStackKind | null;
  nativeBuildPreview?: boolean;
  previewReloadNonce: number;
  previewSyncing?: boolean;
  previewLiveUpdating?: boolean;
  onPreviewRefresh?: () => void;
  diffEntries: DiffEntry[];
  handleDiffAccept: (diffId: string) => void;
  handleDiffReject: (diffId: string) => void;
  handleDiffAcceptAll: () => void;
  handleDiffRejectAll: () => void;
  logPanelOpen: boolean;
  setLogPanelOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  logs: LogEntry[];
  logPanelTab: "terminal" | "console" | "problems" | "shot";
  paletteOpen: boolean;
  setPaletteOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  paletteActions: PaletteAction[];
  cheatsheetOpen: boolean;
  setCheatsheetOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  isDragOver: boolean;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  isMobile?: boolean;
  mobilePanel?: EditorMobilePanel;
  onMobilePanelChange?: (panel: EditorMobilePanel) => void;
};

export function EditorPageLayout({
  projectId,
  conversationId,
  projectName,
  running,
  agent,
  mainView,
  onMainViewChange,
  handleShare,
  handleOpenLiveSite,
  publishButtonLabel,
  contentPublishReady = false,
  liveSiteUrl,
  previewBoot,
  autoPublishPublishing,
  connectorStatus,
  connectorModes,
  connectorModal,
  openConnector,
  closeConnectorModal,
  saveConnector,
  previewNavFiles,
  previewRoute,
  setPreviewRoute,
  devUrl,
  previewIframeRef,
  setPreviewReloadNonce,
  previewDevice,
  setPreviewDevice,
  e2bConnected,
  chatMessages,
  chatMessagesLoading = false,
  handleResumeAgent,
  handleSend,
  handleStop,
  handleVisualEdits,
  pickMode,
  visualEditor,
  onVisualEditorCancel,
  onTogglePickMode,
  filePaths,
  composerMode,
  setComposerMode,
  promptDraft,
  setPromptDraft,
  handleRollbackMessage,
  handlePlanApprove,
  handlePlanReject,
  hasUserLlmKey: _hasUserLlmKey,
  agentPrefs: _agentPrefs,
  connectorRows: _connectorRows,
  showFileTree,
  activeView,
  fileTreeFiles,
  activeFilePath,
  handleSelectFile,
  openTabs,
  handleCloseTab,
  handleContentChange,
  previewIdle,
  agentHasRun,
  isReactProject,
  projectStack = null,
  nativeBuildPreview = false,
  previewReloadNonce,
  previewSyncing = false,
  previewLiveUpdating = false,
  onPreviewRefresh,
  diffEntries,
  handleDiffAccept,
  handleDiffReject,
  handleDiffAcceptAll,
  handleDiffRejectAll,
  logPanelOpen,
  setLogPanelOpen,
  logs,
  logPanelTab,
  paletteOpen,
  setPaletteOpen,
  paletteActions,
  cheatsheetOpen,
  setCheatsheetOpen,
  isDragOver,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  isMobile = false,
  mobilePanel = "chat",
  onMobilePanelChange,
}: EditorPageLayoutProps) {
  const activeRun = useActiveRun(agent);

  const pendingPlan = usePendingPlan({
    livePlan: agent.progress.pendingPlan,
    messages: chatMessages,
    activeRunId: agent.activeRunId,
  });

  const {
    jobWorkspaceFocus,
    openJobWorkspace,
    closeJobWorkspace,
    setJobTab,
    isJobFocused,
    clearInspectorDismissed,
    isInspectorDismissedForRun,
  } = useJobWorkspaceFocus();

  const handleOpenInspector = (
    runId: string,
    tab: "timeline" | "changes" | "plan" = "timeline",
  ) => {
    openJobWorkspace(runId, tab);
    if (isMobile) {
      onMobilePanelChange?.("preview");
    } else {
      onMainViewChange("preview");
    }
  };

  const closeInspectorAndReturnToChat = useCallback(() => {
    closeJobWorkspace();
    if (isMobile) {
      onMobilePanelChange?.("chat");
    } else {
      // Volta o workspace para o preview (toggle de preview), nunca para o Monaco.
      onMainViewChange("preview");
    }
  }, [closeJobWorkspace, isMobile, onMobilePanelChange, onMainViewChange]);

  useEffect(() => {
    const onOpenConnector = (ev: Event) => {
      const { connector } = (ev as CustomEvent<{ connector: ConnectorId }>).detail;
      if (connector) openConnector(connector);
    };
    window.addEventListener(OPEN_CONNECTOR_EVENT, onOpenConnector);
    return () => window.removeEventListener(OPEN_CONNECTOR_EVENT, onOpenConnector);
  }, [openConnector]);

  const prevInspectorRunRef = useRef<string | null>(null);
  const autoOpenedInspectorRunRef = useRef<string | null>(null);
  const inspectorLiveRunRef = useRef<{
    runId: string | null;
    sawLive: boolean;
    startedAtMs: number | null;
  }>({
    runId: null,
    sawLive: false,
    startedAtMs: null,
  });

  useEffect(() => {
    const rid = agent.activeRunId;
    if (!rid || rid === PENDING_RUN_ID) return;
    if (prevInspectorRunRef.current !== rid) {
      clearInspectorDismissed();
      autoOpenedInspectorRunRef.current = null;
      prevInspectorRunRef.current = rid;
    }
  }, [agent.activeRunId, clearInspectorDismissed]);

  useEffect(() => {
    const runId = jobWorkspaceFocus?.runId ?? null;
    if (inspectorLiveRunRef.current.runId !== runId) {
      inspectorLiveRunRef.current = { runId, sawLive: false, startedAtMs: null };
    }
    if (runId && agent.activeRunId === runId) {
      inspectorLiveRunRef.current.sawLive = true;
      if (agent.activeRunStartedAtMs != null) {
        inspectorLiveRunRef.current.startedAtMs = agent.activeRunStartedAtMs;
      }
    }
  }, [jobWorkspaceFocus?.runId, agent.activeRunId, agent.activeRunStartedAtMs]);

  useEffect(() => {
    const runId = agent.activeRunId;
    if (!runId || runId === PENDING_RUN_ID) return;
    if (!running) return;
    if (jobWorkspaceFocus?.runId === runId) return;
    if (agent.progress.conversational) return;
    if (pendingPlan) return;
    if (isInspectorDismissedForRun(runId)) return;
    if (autoOpenedInspectorRunRef.current === runId) return;
    const hasStartedWork =
      (agent.progress.tools?.length ?? 0) > 0 ||
      (agent.progress.diffs?.length ?? 0) > 0 ||
      (agent.progress.buildLogLines?.length ?? 0) > 0 ||
      (agent.progress.deliveryFiles?.length ?? 0) > 0;
    if (!hasStartedWork) return;

    const timer = window.setTimeout(() => {
      if (autoOpenedInspectorRunRef.current !== runId && !isInspectorDismissedForRun(runId)) {
        autoOpenedInspectorRunRef.current = runId;
        handleOpenInspector(runId, "timeline");
      }
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [
    running,
    agent.activeRunId,
    jobWorkspaceFocus,
    agent.progress,
    pendingPlan,
    isInspectorDismissedForRun,
    handleOpenInspector,
  ]);

  const focusedJobProgress = useMemo((): AgentProgress | null => {
    if (!jobWorkspaceFocus) return null;
    const { runId } = jobWorkspaceFocus;
    const runWasLive =
      inspectorLiveRunRef.current.runId === runId && inspectorLiveRunRef.current.sawLive;
    return resolveInspectorRunProgress(runId, chatMessages, {
      activeRunId: agent.activeRunId,
      liveProgress: agent.progress,
      frozenProgress: agent.getFrozenRunProgress(runId),
      runWasLive,
    });
  }, [
    jobWorkspaceFocus,
    agent.activeRunId,
    agent.progress,
    chatMessages,
    agent.getFrozenRunProgress,
    agent.frozenProgressTick,
  ]);

  const focusedJobRunning = useMemo(() => {
    if (!jobWorkspaceFocus || !focusedJobProgress) return false;
    if (agent.activeRunId === jobWorkspaceFocus.runId) return running;
    return (
      inspectorLiveRunRef.current.runId === jobWorkspaceFocus.runId &&
      inspectorLiveRunRef.current.sawLive &&
      !focusedJobProgress.finished
    );
  }, [agent.activeRunId, focusedJobProgress, jobWorkspaceFocus, running]);

  const focusedJobRunStartedAtMs = useMemo(() => {
    if (!jobWorkspaceFocus) return null;
    if (agent.activeRunId === jobWorkspaceFocus.runId) return agent.activeRunStartedAtMs;
    if (
      inspectorLiveRunRef.current.runId === jobWorkspaceFocus.runId &&
      inspectorLiveRunRef.current.sawLive
    ) {
      return inspectorLiveRunRef.current.startedAtMs;
    }
    return null;
  }, [agent.activeRunId, agent.activeRunStartedAtMs, jobWorkspaceFocus]);

  const focusedInspectorPlan = useMemo(() => {
    if (!jobWorkspaceFocus) return null;
    return resolveInspectorPlanForRun(jobWorkspaceFocus.runId, chatMessages, {
      livePlan: pendingPlan?.runId === jobWorkspaceFocus.runId ? pendingPlan : null,
      progressPlan: focusedJobProgress?.pendingPlan ?? null,
    });
  }, [jobWorkspaceFocus, chatMessages, pendingPlan, focusedJobProgress?.pendingPlan]);

  const inspectorPlanNav =
    isJobFocused && jobWorkspaceFocus?.tab === "plan" && focusedInspectorPlan
      ? {
          onBackToLatest: closeJobWorkspace,
          activeTab: jobWorkspaceFocus.tab,
          onTabChange: setJobTab,
          showPlanTab: true,
        }
      : undefined;

  const previewStatusLabel = useMemo(() => {
    if (running && isMobile) return "Agente trabalhando";
    if (isMobile && pendingPlan) return "Plano aguardando";
    if (
      isMobile &&
      (agent.progress.awaitingKind === "clarify" ||
        (agent.progress.awaitingKind as string | null) === "qualify") &&
      !pendingPlan
    )
      return "Aguardando você";
    return null;
  }, [running, isMobile, pendingPlan, agent.progress.awaitingKind]);

  return (
    <>
      <style>{HEAT_MAP_CSS}</style>

      <EditorShell topBar="none">
        <div
          className="flex min-h-0 h-full w-full flex-1 flex-col overflow-hidden"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <EditorResizableLayout
            isMobile={isMobile}
            mobilePanel={mobilePanel}
            workspaceCode={activeView === "code"}
            mobileHeader={
              isMobile ? (
                <EditorMobileHeader
                  mobilePanel={mobilePanel}
                  projectId={projectId}
                  projectName={projectName}
                  statusLabel={previewStatusLabel}
                  onShare={handleShare}
                  onPublish={handleOpenLiveSite}
                  publishLabel={publishButtonLabel}
                  publishDisabled={
                    !liveSiteUrl &&
                    (!contentPublishReady ||
                      previewBoot.booting ||
                      previewBoot.warming ||
                      autoPublishPublishing)
                  }
                  onPreviewRefresh={() => {
                    if (onPreviewRefresh) {
                      onPreviewRefresh();
                    } else {
                      void previewBoot.boot({ force: true });
                    }
                  }}
                  previewRefreshDisabled={previewBoot.booting}
                />
              ) : undefined
            }
            mobileTabBar={
              isMobile ? (
                <EditorMobileTabBar
                  value={mobilePanel}
                  onChange={onMobilePanelChange ?? (() => {})}
                />
              ) : undefined
            }
            chatHeader={
              <EditorChatHeader
                projectId={projectId}
                projectName={projectName ?? undefined}
                running={running}
                awaitingUser={
                  (agent.progress.awaitingKind === "clarify" ||
                    (agent.progress.awaitingKind as string | null) === "qualify") &&
                  !pendingPlan
                }
                planPending={!!pendingPlan}
                pendingQueueCount={agent.progress.pendingQueueCount}
              />
            }
            workspaceHeader={
              <EditorWorkspaceHeader
                activeView={mainView}
                onViewChange={onMainViewChange}
                onShare={handleShare}
                onPublish={handleOpenLiveSite}
                publishLabel={publishButtonLabel}
                publishDisabled={
                  !liveSiteUrl &&
                  (!contentPublishReady ||
                    previewBoot.booting ||
                    previewBoot.warming ||
                    autoPublishPublishing)
                }
                e2bConnected={e2bConnected}
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
                    if (onPreviewRefresh) {
                      onPreviewRefresh();
                    } else {
                      void previewBoot.boot({ force: true });
                    }
                  },
                  device: previewDevice,
                  onDeviceChange: setPreviewDevice,
                }}
                previewStatusLabel={previewStatusLabel}
                jobInspectorActive={isJobFocused}
                inspectorPlanNav={inspectorPlanNav}
              />
            }
            chat={
              <div className="forge-chat-column">
                <TastePostStartBanner />
                <ChatPanel
                  projectId={projectId}
                  conversationId={conversationId}
                  messages={chatMessages}
                  messagesLoading={chatMessagesLoading}
                  agentHasRun={agentHasRun}
                  agent={agent}
                  running={running}
                  composerMode={composerMode}
                  onComposerModeChange={setComposerMode}
                  onSend={handleSend}
                  onStop={handleStop}
                  onResume={handleResumeAgent}
                  onOpenInspector={handleOpenInspector}
                  onPlanApprove={async (steps, markdown) => {
                    await handlePlanApprove(steps, markdown);
                    closeInspectorAndReturnToChat();
                  }}
                  onPlanReject={(reason) => {
                    handlePlanReject(reason);
                    closeInspectorAndReturnToChat();
                  }}
                  onRollbackMessage={handleRollbackMessage}
                  focusedRunId={jobWorkspaceFocus?.runId ?? null}
                  externalPrompt={promptDraft}
                  onExternalPromptConsumed={() => setPromptDraft(null)}
                  pendingQueueItems={agent.pendingQueueItems}
                  queuePaused={agent.queuePaused}
                  onUpdateQueueRepeat={(id, repeat) =>
                    conversationId
                      ? agent.updatePendingItem(projectId, conversationId, id, { repeat })
                      : Promise.resolve()
                  }
                  onUpdateQueueText={(id, text) =>
                    conversationId
                      ? agent.updatePendingItem(projectId, conversationId, id, { text })
                      : Promise.resolve()
                  }
                  onReorderQueueItem={(id, sortOrder) =>
                    conversationId
                      ? agent.reorderPendingItem(projectId, conversationId, id, sortOrder)
                      : Promise.resolve()
                  }
                  onToggleQueueItemPaused={(id, paused) =>
                    conversationId
                      ? agent.updatePendingItem(projectId, conversationId, id, { paused })
                      : Promise.resolve()
                  }
                  onToggleQueuePaused={(paused) =>
                    conversationId
                      ? agent.setQueuePaused(projectId, conversationId, paused)
                      : Promise.resolve()
                  }
                  onClearPendingItem={(id) =>
                    conversationId
                      ? agent.clearPendingItem(projectId, conversationId, id)
                      : Promise.resolve()
                  }
                  onVisualEdits={handleVisualEdits}
                  visualEditsActive={pickMode}
                />
              </div>
            }
            workspace={
              <div className="flex min-h-0 h-full w-full flex-1 flex-col">
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  {showFileTree && activeView === "code" && !isMobile && (
                    <div className="w-[200px] shrink-0 border-r border-[var(--forge-border)] bg-[var(--bg-hover)]">
                      <FileTree
                        files={fileTreeFiles}
                        activePath={activeFilePath}
                        onSelectFile={handleSelectFile}
                        onCreateFile={() => {}}
                        onCreateFolder={() => {}}
                        onRename={() => {}}
                        onDelete={() => {}}
                        hasUnsavedChanges={openTabs.some((t) => t.isModified)}
                      />
                    </div>
                  )}

                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    {isMobile && mobilePanel === "code" && fileTreeFiles.length > 0 && (
                      <div className="forge-mobile-code-bar">
                        <label
                          htmlFor="forge-mobile-code-select"
                          className="forge-mobile-code-label"
                        >
                          Arquivo
                        </label>
                        <select
                          id="forge-mobile-code-select"
                          className="forge-mobile-code-select"
                          value={activeFilePath ?? ""}
                          onChange={(e) => handleSelectFile(e.target.value)}
                        >
                          {!activeFilePath && (
                            <option value="" disabled>
                              Escolher arquivo…
                            </option>
                          )}
                          {fileTreeFiles.map((path) => (
                            <option key={path} value={path}>
                              {path}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {(!isMobile || mobilePanel === "preview") && (
                      <StackHonestBanner
                        files={previewNavFiles}
                        onFocusChat={() => {
                          if (isMobile) onMobilePanelChange?.("chat");
                          const el =
                            document.querySelector<HTMLTextAreaElement>(".forge-composer-input");
                          el?.focus();
                        }}
                      />
                    )}
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                      {activeView === "code" && (
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                          <CodeEditor
                            tabs={openTabs}
                            activePath={activeFilePath}
                            onSelectTab={handleSelectFile}
                            onCloseTab={handleCloseTab}
                            onContentChange={handleContentChange}
                          />
                        </div>
                      )}

                      {activeView === "preview" &&
                        isJobFocused &&
                        jobWorkspaceFocus &&
                        focusedJobProgress && (
                          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                            <JobInspector
                              run={focusedJobProgress}
                              runId={jobWorkspaceFocus.runId}
                              running={focusedJobRunning}
                              activeTab={jobWorkspaceFocus.tab}
                              messages={chatMessages}
                              livePendingPlan={
                                pendingPlan?.runId === jobWorkspaceFocus.runId ? pendingPlan : null
                              }
                              onTabChange={setJobTab}
                              onBackToLatest={closeJobWorkspace}
                              onOpenFile={(path) => {
                                handleSelectFile(path);
                                onMainViewChange("code");
                                if (isMobile) onMobilePanelChange?.("code");
                              }}
                              onPlanApprove={async (steps, markdown) => {
                                await handlePlanApprove(steps, markdown);
                                closeInspectorAndReturnToChat();
                              }}
                              onPlanReject={(reason) => {
                                handlePlanReject(reason);
                                closeInspectorAndReturnToChat();
                              }}
                              onPlanEditRequest={(plan) => {
                                const headline =
                                  plan.mission?.trim() || plan.summary?.trim() || "este plano";
                                setPromptDraft(`Ajuste ${headline}: `);
                                if (isMobile) onMobilePanelChange?.("chat");
                                window.requestAnimationFrame(() => {
                                  const el =
                                    document.querySelector<HTMLTextAreaElement>(
                                      ".forge-composer-input",
                                    );
                                  el?.focus();
                                });
                              }}
                              runStartedAtMs={focusedJobRunStartedAtMs}
                              fullWidth
                            />
                          </div>
                        )}

                      {activeView === "preview" &&
                        !(isJobFocused && jobWorkspaceFocus && focusedJobProgress) && (
                          <div className="forge-preview-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                            <PreviewFrame
                              files={previewNavFiles}
                              booting={previewBoot.booting}
                              agentRunning={running}
                              previewLiveUpdating={previewLiveUpdating}
                              devUrl={devUrl}
                              previewPath={previewRoute}
                              iframeRef={previewIframeRef}
                              bootError={previewBoot.lastError}
                              warming={previewBoot.warming}
                              onWarmComplete={previewBoot.clearWarming}
                              onRefresh={() =>
                                onPreviewRefresh
                                  ? onPreviewRefresh()
                                  : void previewBoot.boot({ force: true })
                              }
                              reloadNonce={previewReloadNonce}
                              previewSyncing={previewSyncing}
                              agentHasRun={agentHasRun}
                              previewIdle={previewIdle}
                              isNoFiles={previewBoot.isNoFiles}
                              sandboxStale={previewBoot.sandboxStale}
                              reconnecting={previewBoot.reconnecting}
                              isReactProject={isReactProject}
                              nativeBuildPreview={nativeBuildPreview}
                              projectStack={projectStack}
                              agentProgress={agent.progress}
                              device={previewDevice}
                              onFocusChat={() => {
                                const el =
                                  document.querySelector<HTMLTextAreaElement>(
                                    ".forge-composer-input",
                                  );
                                el?.focus();
                              }}
                            />
                            <VisualEditorPanel
                              mode={visualEditor.mode}
                              selectedElement={visualEditor.selectedElement}
                              computedStyles={visualEditor.computedStyles}
                              activeEditGroup={visualEditor.activeEditGroup}
                              editGroups={visualEditor.editGroups}
                              onUpdateStyle={visualEditor.updateStyleEdit}
                              onRemoveEdit={visualEditor.removeStyleEdit}
                              onRevertAll={visualEditor.revertAllEdits}
                              onApply={visualEditor.handleApply}
                              onCancel={onVisualEditorCancel}
                              onTogglePicking={onTogglePickMode}
                            />
                          </div>
                        )}

                      {activeView === "diff" && (
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                          <AiDiffViewer
                            diffs={diffEntries}
                            activeDiffId={diffEntries[0]?.id ?? null}
                            onSelectDiff={() => {}}
                            onAccept={handleDiffAccept}
                            onReject={handleDiffReject}
                            onAcceptAll={handleDiffAcceptAll}
                            onRejectAll={handleDiffRejectAll}
                          />
                        </div>
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

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
        files={filePaths}
        onOpenFile={handleSelectFile}
      />

      <ShortcutCheatsheet isOpen={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />

      {isDragOver && (
        <div className="pointer-events-none fixed inset-0 z-[200] m-3 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--primary)]/50 bg-black/70">
          <p className="text-sm text-[var(--primary)]">Solte os arquivos para importar</p>
        </div>
      )}
    </>
  );
}
