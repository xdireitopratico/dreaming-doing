import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import type { editor } from "monaco-editor";


import { createLogEntry, type LogEntry } from "@/components/editor/LogPanel";
import type { DiffEntry } from "@/components/editor/AiDiffViewer";
import { useAgentBlame, buildBlameFromTimeline } from "@/hooks/useAgentBlame";
import type { usePreviewBoot } from "@/hooks/usePreviewBoot";
import { clearEnhancements } from "@/lib/monacoEnhancements";
import { isAgentConnectInFlight } from "@/lib/agent-session-guards";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { useAgentSessionCoordinator } from "./useAgentSessionCoordinator";
import type { useAgentRun } from "@/hooks/useAgentRun";

import type { FileRow } from "./editor-page-types";

type AgentRun = ReturnType<typeof useAgentRun>;
type PreviewBoot = ReturnType<typeof usePreviewBoot>;

type TasteQuota = {
  tasteChatRemaining: number;
  tasteStartRemaining: number;
  hasUserLlmKey: boolean;
};

type UseEditorAgentOrchestrationParams = {
  projectId: string;
  conversation: { id: string } | null | undefined;
  files: FileRow[] | undefined;
  agent: AgentRun;
  qc: QueryClient;
  running: boolean;
  setRunning: (value: boolean | ((prev: boolean) => boolean)) => void;
  logs: LogEntry[];
  setLogs: (value: LogEntry[] | ((prev: LogEntry[]) => LogEntry[])) => void;
  logPanelOpen: boolean;
  setLogPanelOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  e2bConnected: boolean;
  isReactProject: boolean;
  nativeBuildPreview: boolean;
  agentHasRun: boolean;
  devUrl: string | null;
  activeView: "code" | "preview" | "diff";
  setPreviewReloadNonce: (value: number | ((prev: number) => number)) => void;
  tasteQuota: TasteQuota;
  /** `${conversationId}:${lastUserMessageId}` quando a última msg é do user sem resposta. */
  pendingAgentRunKey: string | null;
  runAgent: (
    explicitKind?: import("@/lib/taste").ForgeSessionKind,
    explicitAction?: import("@/lib/taste").TasteAction,
  ) => boolean;
  fileMap: Map<string, string>;
  editorRef: RefObject<editor.IStandaloneCodeEditor | null>;
  monacoRef: RefObject<typeof import("monaco-editor") | null>;
  previewBoot: PreviewBoot;
  previewIdle: boolean;
  reviewedDiffs: Record<string, "accept" | "reject">;
};

export function useEditorAgentOrchestration({
  projectId,
  conversation,
  files,
  agent,
  qc,
  running,
  setRunning,
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
  pendingAgentRunKey,
  runAgent,
  fileMap,
  editorRef,
  monacoRef,
  previewBoot,
  previewIdle,
  reviewedDiffs,
}: UseEditorAgentOrchestrationParams) {
  /** Evita boot duplicado do preview entre fim do agente e refetch do previewUrl. */
  const previewBootAfterAgentRef = useRef(false);
  const previewBootDuringRunRef = useRef(false);
  const lastSyncedFilesKeyRef = useRef("");
  const lastPreviewSyncTickRef = useRef(0);
  const previewSyncInFlightRef = useRef(false);
  const [previewSyncInFlight, setPreviewSyncInFlight] = useState(false);
  const lastPendingAgentRunRef = useRef<string | null>(null);

  const supportsLivePreview = isReactProject && !nativeBuildPreview;

  useAgentSessionCoordinator({
    projectId,
    conversation,
    agent,
    running,
    tasteQuota,
    runAgent,
  });

  // Mensagem user sem resposta (ex.: 1º send antes da conversa carregar, ou auto-run perdido).
  useEffect(() => {
    if (!pendingAgentRunKey || !conversation?.id) return;
    if (running || agent.connected || isAgentConnectInFlight()) return;
    if (lastPendingAgentRunRef.current === pendingAgentRunKey) return;

    lastPendingAgentRunRef.current = pendingAgentRunKey;
    logEditorTelemetryEvent("agent", "pending_user_run", "info", pendingAgentRunKey.slice(0, 16));
    runAgent();
  }, [
    pendingAgentRunKey,
    conversation?.id,
    running,
    agent.connected,
    runAgent,
  ]);

  const fileCount = files?.length ?? 0;

  const previewE2bCircuit = previewBoot.isE2bCircuit;

  const diffEntries = useMemo((): DiffEntry[] => {
    return agent.progress.diffs.map((d) => ({
      id: d.id,
      path: d.path,
      before: d.before || (fileMap.get(d.path) ?? ""),
      after: d.after,
      author: "FORGE Agent",
      timestamp: d.timestamp,
      reviewed: reviewedDiffs[d.id] != null,
      decision: reviewedDiffs[d.id] ?? null,
    }));
  }, [agent.progress.diffs, fileMap, reviewedDiffs]);

  const blameEntries = useMemo(
    () => buildBlameFromTimeline(agent.progress.timeline),
    [agent.progress.timeline],
  );
  useAgentBlame({ blameMap: blameEntries, editorRef, monacoRef });

  // ─── Sync running state — slot live enquanto há run ativa (mesmo antes do realtime conectar) ──
  useEffect(() => {
    const active =
      agent.activeRunId != null &&
      !agent.progress.finished &&
      !agent.progress.canceled;
    setRunning(active);
  }, [
    agent.activeRunId,
    agent.progress.finished,
    agent.progress.canceled,
    setRunning,
  ]);

  // ─── Realtime events → logs ─────────────────────────────────────────
  useEffect(() => {
    const last = agent.progress.timeline.at(-1);
    if (!last) return;
    if (last.type === "phase") {
      setLogs((prev) => [
        ...prev,
        createLogEntry(
          "info",
          `Fase: ${last.data.phase ?? ""} — ${last.data.message ?? ""}`,
          "agent",
        ),
      ]);
    }
    if (last.type === "tool_done") {
      setLogs((prev) => [
        ...prev,
        createLogEntry(
          last.data.ok ? "success" : "error",
          `${last.data.name}: ${last.data.ok ? "ok" : last.data.error ?? "erro"}`,
          "agent",
        ),
      ]);
    }
    if (last.type === "error") {
      setLogs((prev) => [
        ...prev,
        createLogEntry("error", (last.data.error as string) ?? "Erro", "agent"),
      ]);
    }
  }, [agent.progress.timeline.length, setLogs]);

  // ─── Monaco enhancements globais ────────────────────────────────────
  useEffect(() => {
    clearEnhancements();
    return () => clearEnhancements();
  }, []);

  useEffect(() => {
    if (!agent.progress.finished || !conversation) return;
    void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });
    void qc.invalidateQueries({ queryKey: ["profile"] });
  }, [agent.progress.finished, conversation, qc]);

  const agentFinished = agent.progress.finished;
  const agentShouldBootPreview =
    agentFinished &&
    !agent.progress.canceled &&
    !agent.progress.awaiting &&
    (agent.progress.lastFinishOk === true ||
      agent.progress.resumable === true ||
      (agent.progress.lastFinishOk === null && agentHasRun && !agent.progress.error));

  // Boot sandbox durante run (web/expo) para preview ao vivo enquanto o agente edita.
  useEffect(() => {
    if (!running) {
      previewBootDuringRunRef.current = false;
      return;
    }
    if (!supportsLivePreview || !e2bConnected || previewBoot.booting || previewE2bCircuit) return;
    if (fileCount === 0 || devUrl) return;
    if (previewBootDuringRunRef.current) return;
    previewBootDuringRunRef.current = true;
    void previewBoot.bootWithRetry({ force: true, silent: true });
  }, [
    running,
    supportsLivePreview,
    e2bConnected,
    devUrl,
    previewBoot.booting,
    previewBoot.bootWithRetry,
    previewE2bCircuit,
    fileCount,
  ]);

  useEffect(() => {
    if (running) {
      previewBootAfterAgentRef.current = false;
      return;
    }
    if (!supportsLivePreview || !e2bConnected || previewBoot.booting || previewE2bCircuit) return;
    if (fileCount === 0) return;
    if (!agentShouldBootPreview) return;
    if (previewBootAfterAgentRef.current) return;
    previewBootAfterAgentRef.current = true;
    void previewBoot.bootWithRetry(
      devUrl
        ? { syncOnly: true, silent: true }
        : { force: true, silent: true },
    );
  }, [
    agentShouldBootPreview,
    running,
    supportsLivePreview,
    e2bConnected,
    devUrl,
    previewBoot.booting,
    previewBoot.bootWithRetry,
    previewE2bCircuit,
    fileCount,
  ]);

  const filesSyncKey = useMemo(
    () => files?.map((f) => `${f.path}:${f.updated_at}`).join("|") ?? "",
    [files],
  );

  const syncPreviewToSandbox = useCallback(
    async (reload: boolean) => {
      if (!supportsLivePreview || !e2bConnected || previewE2bCircuit) return;
      if (fileCount === 0) return;
      if (previewSyncInFlightRef.current) return;
      previewSyncInFlightRef.current = true;
      setPreviewSyncInFlight(true);
      try {
        const url = await previewBoot.boot({
          ...(devUrl ? { syncOnly: true } : { force: true }),
          silent: true,
        });
        if (reload && (devUrl || url)) {
          setPreviewReloadNonce((n) => n + 1);
        }
      } finally {
        previewSyncInFlightRef.current = false;
        setPreviewSyncInFlight(false);
      }
    },
    [
      supportsLivePreview,
      e2bConnected,
      previewBoot.boot,
      previewE2bCircuit,
      devUrl,
      fileCount,
      setPreviewReloadNonce,
    ],
  );

  const fileSyncDebounceMs = running ? 300 : 600;
  const previewTickDebounceMs = running ? 400 : 800;

  useEffect(() => {
    if (!filesSyncKey || filesSyncKey === lastSyncedFilesKeyRef.current) return;
    if (!supportsLivePreview || !e2bConnected || previewE2bCircuit || fileCount === 0) return;
    lastSyncedFilesKeyRef.current = filesSyncKey;
    const t = window.setTimeout(() => {
      void syncPreviewToSandbox(activeView === "preview" || running);
    }, fileSyncDebounceMs);
    return () => window.clearTimeout(t);
  }, [
    filesSyncKey,
    fileCount,
    supportsLivePreview,
    e2bConnected,
    previewE2bCircuit,
    activeView,
    running,
    fileSyncDebounceMs,
    syncPreviewToSandbox,
  ]);

  useEffect(() => {
    const tick = agent.progress.previewSyncTick ?? 0;
    if (tick <= lastPreviewSyncTickRef.current) return;
    if (!supportsLivePreview || !e2bConnected || previewE2bCircuit || fileCount === 0) return;
    lastPreviewSyncTickRef.current = tick;
    const t = window.setTimeout(() => {
      void syncPreviewToSandbox(true);
    }, previewTickDebounceMs);
    return () => window.clearTimeout(t);
  }, [
    agent.progress.previewSyncTick,
    fileCount,
    supportsLivePreview,
    e2bConnected,
    previewE2bCircuit,
    previewTickDebounceMs,
    syncPreviewToSandbox,
  ]);

  const previewSyncing = previewSyncInFlight || (previewBoot.booting && !!devUrl);

  return {
    previewE2bCircuit,
    diffEntries,
    blameEntries,
    filesSyncKey,
    previewSyncing,
    previewLiveUpdating: running && supportsLivePreview && (previewSyncing || !!devUrl),
  };
}