import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
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
import { ForgeChatPanel } from "@/components/editor/ForgeChatPanel";
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
import { needsPlanApprovalNow, resolvePendingPlan } from "@/lib/plan-message-meta";
import { PENDING_RUN_ID, resolveAssistantProgress } from "@/lib/lovable-thread";
import {
  hasMaterializedCardSnapshot,
  progressFromAssistantMessage,
} from "@/lib/assistant-run-progress";
import type { AgentProgress } from "@/lib/agent-progress";
import { useJobWorkspaceFocus } from "@/hooks/useJobWorkspaceFocus";
import { JobInspector } from "@/components/editor/JobInspector";
import type { useAgentRun } from "@/hooks/useAgentRun";
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
  filePaths: string[];
  composerMode: AgentComposerMode;
  setComposerMode: (mode: AgentComposerMode) => void;
  promptDraft: string | null;
  setPromptDraft: (value: string | null) => void;
  welcomeMarkdown: string;
  tasteChatRemaining: number;
  tasteStartRemaining: number;
  handleStartProject: () => void;
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
  filePaths,
  composerMode,
  setComposerMode,
  promptDraft,
  setPromptDraft,
  welcomeMarkdown,
  tasteChatRemaining,
  tasteStartRemaining,
  handleStartProject,
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
  const pendingPlan = useMemo(() => {
    const plan = resolvePendingPlan(agent.progress.pendingPlan, chatMessages);
    return needsPlanApprovalNow(agent.progress.pendingPlan, chatMessages) ? plan : null;
  }, [agent.progress.pendingPlan, chatMessages]);

  const showWelcomeMarkdown = useMemo(() => {
    if (chatMessagesLoading || chatMessages.length > 0) return false;
    if (agentHasRun) return false;
    if (agent.frozenRuns.size > 0 || agent.activeRunId) return false;
    return true;
  }, [
    chatMessagesLoading,
    chatMessages.length,
    agentHasRun,
    agent.frozenRuns.size,
    agent.activeRunId,
  ]);
  useEffect(() => {
    if (pendingPlan && !agent.progress.pendingPlan) {
      agent.hydratePendingPlan(pendingPlan);
    }
  }, [pendingPlan, agent.progress.pendingPlan, agent.hydratePendingPlan]);

  useEffect(() => {
    agent.reconcileFrozenWithMessages(chatMessages);
  }, [chatMessages, agent.reconcileFrozenWithMessages]);

  const {
    jobWorkspaceFocus,
    openJobWorkspace,
    closeJobWorkspace,
    setJobTab,
    isJobFocused,
    isInspectorDismissedForRun,
    clearInspectorDismissed,
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

  useEffect(() => {
    const onOpenConnector = (ev: Event) => {
      const { connector } = (ev as CustomEvent<{ connector: ConnectorId }>).detail;
      if (connector) openConnector(connector);
    };
    window.addEventListener(OPEN_CONNECTOR_EVENT, onOpenConnector);
    return () => window.removeEventListener(OPEN_CONNECTOR_EVENT, onOpenConnector);
  }, [openConnector]);

  const prevPendingPlanRef = useRef(pendingPlan);

  useEffect(() => {
    if (!pendingPlan) return;
    const runId = pendingPlan.runId || agent.activeRunId;
    if (!runId) return;
    openJobWorkspace(runId, "plan");
    if (isMobile) onMobilePanelChange?.("preview");
  }, [
    pendingPlan?.planId,
    pendingPlan?.runId,
    agent.activeRunId,
    openJobWorkspace,
    isMobile,
    onMobilePanelChange,
  ]);

  useEffect(() => {
    const hadPlan = !!prevPendingPlanRef.current;
    prevPendingPlanRef.current = pendingPlan;
    if (hadPlan && !pendingPlan && agent.activeRunId) {
      openJobWorkspace(agent.activeRunId, "timeline");
      if (isMobile) onMobilePanelChange?.("preview");
    }
  }, [pendingPlan, agent.activeRunId, openJobWorkspace, isMobile, onMobilePanelChange]);

  useEffect(() => {
    if (!pendingPlan && jobWorkspaceFocus?.tab === "plan") {
      setJobTab("timeline");
    }
  }, [pendingPlan, jobWorkspaceFocus?.tab, setJobTab]);

  useEffect(() => {
    if (!running) return;
    const runId = agent.activeRunId;
    if (!runId || runId === PENDING_RUN_ID) return;
    if (agent.progress.conversational) return;
    if (pendingPlan) return;
    if (isInspectorDismissedForRun(runId)) return;
    openJobWorkspace(runId, "timeline");
    if (isMobile) onMobilePanelChange?.("preview");
  }, [
    running,
    agent.activeRunId,
    agent.progress.conversational,
    pendingPlan,
    openJobWorkspace,
    isMobile,
    onMobilePanelChange,
    isInspectorDismissedForRun,
  ]);

  const prevInspectorRunRef = useRef<string | null>(null);
  useEffect(() => {
    const rid = agent.activeRunId;
    if (!rid || rid === PENDING_RUN_ID) return;
    if (prevInspectorRunRef.current !== rid) {
      clearInspectorDismissed();
      prevInspectorRunRef.current = rid;
    }
  }, [agent.activeRunId, clearInspectorDismissed]);

  const focusedJobProgress = useMemo((): AgentProgress | null => {
    if (!jobWorkspaceFocus) return null;
    const { runId } = jobWorkspaceFocus;
    if (agent.activeRunId === runId) return agent.progress;

    const historical = chatMessages.find(
      (m) =>
        m.role === "assistant" &&
        (m.runId === runId ||
          (typeof m.meta?.runId === "string" && m.meta.runId === runId) ||
          (typeof m.meta?.buildRunId === "string" && m.meta.buildRunId === runId)),
    );
    if (historical && hasMaterializedCardSnapshot(historical)) {
      return progressFromAssistantMessage(historical);
    }

    const frozen = agent.frozenRuns.get(runId);
    if (frozen) {
      return (
        resolveAssistantProgress({
          kind: "assistant",
          frozen,
          runId,
          isActive: false,
        }) ?? null
      );
    }
    if (historical) return progressFromAssistantMessage(historical);
    return null;
  }, [jobWorkspaceFocus, agent.activeRunId, agent.progress, agent.frozenRuns, chatMessages]);
  // (defensive resolve via lovable-thread strengthening for correct frozen per runId on multi-turn)

  const previewStatusLabel = useMemo(() => {
    if (isJobFocused) return "Job inspector";
    if (running && previewLiveUpdating) return "Live updating…";
    if (running) return isMobile ? "Agente trabalhando" : "Agent working — clique o job no chat";
    if (isMobile && pendingPlan) return "Plano aguardando";
    if (isMobile && agent.progress.awaitingKind === "qualify" && !pendingPlan)
      return "Aguardando você";
    return null;
  }, [
    isJobFocused,
    running,
    previewLiveUpdating,
    isMobile,
    pendingPlan,
    agent.progress.awaitingKind,
  ]);

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
                    if (previewIframeRef.current?.contentWindow) {
                      previewIframeRef.current.contentWindow.location.reload();
                    } else {
                      void previewBoot.boot({ force: true });
                    }
                    setPreviewReloadNonce((n) => n + 1);
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
                awaitingUser={agent.progress.awaitingKind === "qualify" && !pendingPlan}
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
                previewStatusLabel={previewStatusLabel}
                jobInspectorActive={isJobFocused}
              />
            }
            chat={
              <div className="forge-chat-column">
                <TastePostStartBanner />
                <ForgeChatPanel
                  messages={chatMessages}
                  running={running}
                  agentProgress={agent.progress}
                  activeRunId={agent.activeRunId}
                  frozenRuns={agent.frozenRuns}
                  onResumeAgent={handleResumeAgent}
                  onSend={handleSend}
                  onStop={handleStop}
                  onVisualEdits={handleVisualEdits}
                  visualEditsActive={pickMode}
                  composerMode={composerMode}
                  onComposerModeChange={setComposerMode}
                  externalPrompt={promptDraft}
                  onExternalPromptConsumed={() => setPromptDraft(null)}
                  messagesLoading={chatMessagesLoading}
                  welcomeMarkdown={showWelcomeMarkdown ? welcomeMarkdown : undefined}
                  tasteChatRemaining={tasteChatRemaining}
                  tasteStartRemaining={tasteStartRemaining}
                  onStartProject={handleStartProject}
                  onDeploy={handleOpenLiveSite}
                  onRollbackMessage={handleRollbackMessage}
                  pendingQueueItems={agent.pendingQueueItems}
                  queueBlockingReason={agent.queueBlockingReason}
                  onClearPendingItem={(id) =>
                    conversationId
                      ? agent.clearPendingItem(projectId, conversationId, id)
                      : Promise.resolve()
                  }
                  onClearAllPending={() =>
                    conversationId
                      ? agent.clearAllPending(projectId, conversationId)
                      : Promise.resolve()
                  }
                  onDrainQueue={async () => {
                    if (!conversationId) return;
                    await agent.drainQueue(projectId, conversationId, composerMode);
                  }}
                  onOpenInspector={handleOpenInspector}
                  focusedRunId={jobWorkspaceFocus?.runId ?? null}
                  activeRunStartedAtMs={agent.activeRunStartedAtMs}
                />
              </div>
            }
            workspace={
              <div className="flex min-h-0 h-full w-full flex-1 flex-col">
                <div className="flex min-h-0 flex-1">
                  {showFileTree && activeView === "code" && !isMobile && (
                    <div className="w-[200px] shrink-0 border-r border-[var(--forge-border)] bg-[#1a1c22]">
                      <FileTree
                        files={fileTreeFiles}
                        activePath={activeFilePath}
                        onSelectFile={handleSelectFile}
                        onCreateFile={() => {}}
                        onCreateFolder={() => {}}
                        onRename={() => {}}
                        onDelete={() => {}}
                      />
                    </div>
                  )}

                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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

                      {activeView === "preview" &&
                        isJobFocused &&
                        jobWorkspaceFocus &&
                        focusedJobProgress && (
                          <JobInspector
                            run={focusedJobProgress}
                            runId={jobWorkspaceFocus.runId}
                            running={running && agent.activeRunId === jobWorkspaceFocus.runId}
                            activeTab={jobWorkspaceFocus.tab}
                            pendingPlan={
                              pendingPlan?.runId === jobWorkspaceFocus.runId ? pendingPlan : null
                            }
                            onTabChange={setJobTab}
                            onBackToLatest={closeJobWorkspace}
                            onOpenFile={(path) => {
                              handleSelectFile(path);
                              onMainViewChange("code");
                              if (isMobile) onMobilePanelChange?.("code");
                            }}
                            onPlanApprove={handlePlanApprove}
                            onPlanReject={handlePlanReject}
                            runStartedAtMs={
                              agent.activeRunId === jobWorkspaceFocus.runId
                                ? agent.activeRunStartedAtMs
                                : null
                            }
                          />
                        )}

                      {activeView === "preview" && !(isJobFocused && focusedJobProgress) && (
                        <PreviewFrame
                          files={previewNavFiles}
                          booting={previewBoot.booting}
                          agentRunning={running}
                          previewLiveUpdating={previewLiveUpdating}
                          devUrl={devUrl}
                          previewPath={previewRoute}
                          iframeRef={previewIframeRef}
                          bootError={
                            previewBoot.bootLogs
                              ? `${previewBoot.lastError ?? "Vite subindo"} — ${previewBoot.bootLogs.slice(
                                  0,
                                  280,
                                )}`
                              : previewBoot.lastError
                          }
                          warming={previewBoot.warming}
                          onWarmComplete={previewBoot.clearWarming}
                          onRefresh={() => previewBoot.boot({ force: true })}
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
                              document.querySelector<HTMLTextAreaElement>(".forge-composer-input");
                            el?.focus();
                          }}
                        />
                      )}

                      {activeView === "diff" && (
                        <AiDiffViewer
                          diffs={diffEntries}
                          activeDiffId={diffEntries[0]?.id ?? null}
                          onSelectDiff={() => {}}
                          onAccept={handleDiffAccept}
                          onReject={handleDiffReject}
                          onAcceptAll={handleDiffAcceptAll}
                          onRejectAll={handleDiffRejectAll}
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
