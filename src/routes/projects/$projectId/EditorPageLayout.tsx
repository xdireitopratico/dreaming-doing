import { useEffect, useMemo, useState, type RefObject } from "react";
import { AnimatePresence } from "framer-motion";

import { EditorShell } from "@/components/EditorShell";
import { EditorResizableLayout } from "@/components/editor/EditorResizableLayout";
import { EditorChatHeader } from "@/components/editor/EditorChatHeader";
import { EditorWorkspaceHeader } from "@/components/editor/EditorWorkspaceHeader";
import type { EditorMainView } from "@/components/editor/editor-views";
import type { AgentComposerMode } from "@/components/editor/ChatInput";
import { CodeEditor, type Tab } from "@/components/editor/CodeEditor";
import { FileTree } from "@/components/editor/FileTree";
import { ChatInput, type ChatMessage } from "@/components/editor/ChatInput";
import { SetupRail } from "@/components/editor/SetupRail";
import { TasteSetupChecklist } from "@/components/editor/TasteSetupChecklist";
import { TastePostStartBanner } from "@/components/editor/TastePostStartBanner";
import { PreviewFrame } from "@/components/editor/PreviewFrame";
import { CommandPalette, type PaletteAction } from "@/components/editor/CommandPalette";
import { ShortcutCheatsheet } from "@/components/editor/ShortcutCheatsheet";
import { LogPanel, type LogEntry } from "@/components/editor/LogPanel";
import { AiDiffViewer, type DiffEntry } from "@/components/editor/AiDiffViewer";
import { PlanModal } from "@/components/editor/PlanModal";
import { resolvePendingPlan } from "@/lib/plan-message-meta";
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
  projectName?: string | null;
  running: boolean;
  agent: AgentRun;
  mainView: EditorMainView;
  onMainViewChange: (view: EditorMainView) => void;
  handleShare: () => void;
  handleOpenLiveSite: () => void;
  publishButtonLabel: string;
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
  handleUndoMessage: (assistantMsgId: string) => void;
  handlePlanApprove: (steps: { id: string; enabled: boolean }[], markdown?: string) => Promise<void>;
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
  previewReloadNonce: number;
  previewSyncing?: boolean;
  diffEntries: DiffEntry[];
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
};

export function EditorPageLayout({
  projectId,
  projectName,
  running,
  agent,
  mainView,
  onMainViewChange,
  handleShare,
  handleOpenLiveSite,
  publishButtonLabel,
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
  handleUndoMessage,
  handlePlanApprove,
  handlePlanReject,
  hasUserLlmKey,
  agentPrefs,
  connectorRows,
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
  previewReloadNonce,
  previewSyncing = false,
  diffEntries,
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
}: EditorPageLayoutProps) {
  const pendingPlan = useMemo(
    () => resolvePendingPlan(agent.progress.pendingPlan, chatMessages),
    [agent.progress.pendingPlan, chatMessages],
  );
  const [dismissedPlanId, setDismissedPlanId] = useState<string | null>(null);
  const [forcePlanOpen, setForcePlanOpen] = useState(false);

  useEffect(() => {
    if (!pendingPlan) {
      setDismissedPlanId(null);
      setForcePlanOpen(false);
    }
  }, [pendingPlan?.planId]);

  useEffect(() => {
    if (pendingPlan && !agent.progress.pendingPlan) {
      agent.hydratePendingPlan(pendingPlan);
    }
  }, [pendingPlan, agent.progress.pendingPlan, agent.hydratePendingPlan]);

  useEffect(() => {
    if (pendingPlan && pendingPlan.planId !== dismissedPlanId) {
      setForcePlanOpen(true);
    }
  }, [pendingPlan?.planId, dismissedPlanId]);

  const showPlanModal = pendingPlan != null && forcePlanOpen;

  const closePlanModal = () => {
    if (pendingPlan) setDismissedPlanId(pendingPlan.planId);
    setForcePlanOpen(false);
  };

  const handleReopenPlan = () => {
    setDismissedPlanId(null);
    setForcePlanOpen(true);
  };

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
            workspaceCode={activeView === "code"}
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
                  (previewBoot.booting || previewBoot.warming || autoPublishPublishing)
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
              />
            }
            chat={
              <div className="forge-chat-column">
                <div className="forge-chat-body">
                  <TastePostStartBanner />
                  <ChatInput
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
                    onPlanApprove={handlePlanApprove}
                    onPlanReject={handlePlanReject}
                    onReopenPlan={handleReopenPlan}
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
                        onCreateFile={() => {}}
                        onCreateFolder={() => {}}
                        onRename={() => {}}
                        onDelete={() => {}}
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
                          previewSyncing={previewSyncing}
                          agentHasRun={agentHasRun}
                          e2bConnected={e2bConnected}
                          previewIdle={previewIdle}
                          isNoFiles={previewBoot.isNoFiles}
                          sandboxStale={previewBoot.sandboxStale}
                          reconnecting={previewBoot.reconnecting}
                          isReactProject={isReactProject}
                          projectName={projectName ?? undefined}
                          device={previewDevice}
                          onImportRepo={() => {
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
                          onAccept={() => {}}
                          onReject={() => {}}
                          onAcceptAll={() => {}}
                          onRejectAll={() => {}}
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

      <ShortcutCheatsheet
        isOpen={cheatsheetOpen}
        onClose={() => setCheatsheetOpen(false)}
      />

      {isDragOver && (
        <div className="pointer-events-none fixed inset-0 z-[200] m-3 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--primary)]/50 bg-black/70">
          <p className="text-sm text-[var(--primary)]">Solte os arquivos para importar</p>
        </div>
      )}

      <AnimatePresence>
        {showPlanModal && pendingPlan && (
          <PlanModal
            plan={pendingPlan}
            onClose={closePlanModal}
            onApprove={async (steps, markdown) => {
              await handlePlanApprove(steps, markdown);
              closePlanModal();
            }}
            onReject={async (reason) => {
              await handlePlanReject(reason);
              closePlanModal();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}