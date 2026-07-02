import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import type { editor } from "monaco-editor";

import { createLogEntry, type LogEntry } from "@/components/editor/LogPanel";
import type { DiffEntry } from "@/components/editor/AiDiffViewer";
import { buildBlameFromTimeline, useAgentBlame } from "@/hooks/useAgentBlame";
import type { usePreviewBoot } from "@/hooks/usePreviewBoot";
import { clearEnhancements } from "@/lib/monacoEnhancements";
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
  liveRunActive: boolean;
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
  runAgent: (
    explicitKind?: import("@/lib/taste").ForgeSessionKind,
    explicitAction?: import("@/lib/taste").TasteAction,
  ) => Promise<boolean>;
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
  liveRunActive,
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
  const previewBootInRunAttemptsRef = useRef(0);
  const MAX_IN_RUN_BOOT_ATTEMPTS = 3;
  const lastSyncedFilesKeyRef = useRef("");
  const lastPreviewSyncTickRef = useRef(0);
  const previewSyncInFlightRef = useRef(false);
  const previewSyncPendingReloadRef = useRef(false);
  const [previewSyncInFlight, setPreviewSyncInFlight] = useState(false);

  const supportsLivePreview = isReactProject && !nativeBuildPreview;

  useAgentSessionCoordinator({
    projectId,
    conversation,
    agent,
    tasteQuota,
    runAgent,
  });

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
          `${last.data.name}: ${last.data.ok ? "ok" : (last.data.error ?? "erro")}`,
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
    // Defensive invalidates on terminal (single source for "after terminal, next action" alongside
    // coordinator's post-finish effect + PR3 serialization guards/inFlight/refresh-before-decide).
    // Ensures messages are fresh for Lovable thread anchoring on rapid successive runs (second msg).
    void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });
    void qc.invalidateQueries({ queryKey: ["profile"] });
    void qc.invalidateQueries({ queryKey: ["agent-runs", projectId] });
  }, [agent.progress.finished, conversation, qc, projectId]);

  const agentFinished = agent.progress.finished;
  const agentShouldBootPreview =
    agentFinished &&
    !agent.progress.canceled &&
    !agent.progress.awaiting &&
    (agent.progress.lastFinishOk === true || agent.progress.resumable === true);

  // Boot sandbox durante run (web/expo) para preview ao vivo enquanto o agente edita.
  useEffect(() => {
    if (!liveRunActive) {
      previewBootDuringRunRef.current = false;
      previewBootInRunAttemptsRef.current = 0;
      return;
    }
    if (!supportsLivePreview || !e2bConnected || previewBoot.booting || previewE2bCircuit) return;
    if (devUrl) return;
    // P1 fix: gate fileCount === 0. Sem files, não há o que servir no
    // preview — o edge retornaria no_files e a chamada HTTP é desperdiçada
    // (mais telemetria poluída). O effect after-agent (linha 234) já
    // checa fileCount, mas o during-run não. Adicionando aqui.
    if (fileCount === 0) return;
    if (previewBootInRunAttemptsRef.current >= MAX_IN_RUN_BOOT_ATTEMPTS) return;
    if (previewBootDuringRunRef.current) return;
    previewBootDuringRunRef.current = true;
    void previewBoot
      .bootWithRetry({ force: true, silent: true, userInitiated: false })
      .then((url) => {
        previewBootDuringRunRef.current = false;
        if (!url) {
          previewBootInRunAttemptsRef.current += 1;
          return;
        }
        previewBootInRunAttemptsRef.current = 0;
      });
  }, [
    liveRunActive,
    supportsLivePreview,
    e2bConnected,
    devUrl,
    previewBoot.booting,
    previewBoot.bootWithRetry,
    previewE2bCircuit,
    fileCount,
    agent.progress.previewSyncTick,
  ]);

  useEffect(() => {
    if (liveRunActive) {
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
        ? { syncOnly: true, silent: true, userInitiated: false }
        : { force: true, silent: true, userInitiated: false },
    );
  }, [
    agentShouldBootPreview,
    liveRunActive,
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
      if (fileCount === 0 && !liveRunActive) return;
      if (previewSyncInFlightRef.current) {
        if (reload) previewSyncPendingReloadRef.current = true;
        return;
      }
      previewSyncInFlightRef.current = true;
      setPreviewSyncInFlight(true);
      let shouldReload = reload;
      try {
        do {
          previewSyncPendingReloadRef.current = false;
          const url = await previewBoot.boot({
            ...(devUrl ? { syncOnly: true } : { force: true }),
            silent: true,
            userInitiated: false, // P3: auto-sync durante run
          });
          if (shouldReload && url) {
            setPreviewReloadNonce((n) => n + 1);
          }
          shouldReload = previewSyncPendingReloadRef.current;
        } while (previewSyncPendingReloadRef.current);
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
      liveRunActive,
      setPreviewReloadNonce,
    ],
  );

  const fileSyncDebounceMs = liveRunActive ? 0 : 600;
  const previewTickDebounceMs = liveRunActive ? 100 : 800;

  useEffect(() => {
    if (!filesSyncKey || filesSyncKey === lastSyncedFilesKeyRef.current) return;
    if (!supportsLivePreview || !e2bConnected || previewE2bCircuit) return;
    lastSyncedFilesKeyRef.current = filesSyncKey;
    const t = window.setTimeout(
      () => {
        void syncPreviewToSandbox(activeView === "preview" || liveRunActive);
      },
      liveRunActive ? 0 : fileSyncDebounceMs,
    );
    return () => window.clearTimeout(t);
  }, [
    filesSyncKey,
    fileCount,
    supportsLivePreview,
    e2bConnected,
    previewE2bCircuit,
    activeView,
    liveRunActive,
    fileSyncDebounceMs,
    syncPreviewToSandbox,
  ]);

  useEffect(() => {
    const tick = agent.progress.previewSyncTick ?? 0;
    if (tick <= lastPreviewSyncTickRef.current) return;
    if (!supportsLivePreview || !e2bConnected || previewE2bCircuit) return;
    lastPreviewSyncTickRef.current = tick;
    const t = window.setTimeout(
      () => {
        void syncPreviewToSandbox(true);
      },
      liveRunActive ? 0 : previewTickDebounceMs,
    );
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

  const refreshPreview = useCallback(() => {
    if (devUrl) {
      void syncPreviewToSandbox(true);
      return;
    }
    void previewBoot.boot({ force: true });
  }, [devUrl, syncPreviewToSandbox, previewBoot.boot]);

  return {
    previewE2bCircuit,
    diffEntries,
    blameEntries,
    filesSyncKey,
    previewSyncing,
    previewLiveUpdating: liveRunActive && supportsLivePreview && (previewSyncing || !!devUrl),
    refreshPreview,
  };
}
