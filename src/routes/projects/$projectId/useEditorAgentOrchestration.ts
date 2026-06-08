import { useEffect, useMemo, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import type { editor } from "monaco-editor";


import { createLogEntry, type LogEntry } from "@/components/editor/LogPanel";
import type { DiffEntry } from "@/components/editor/AiDiffViewer";
import { useAgentBlame, buildBlameFromTimeline } from "@/hooks/useAgentBlame";
import type { usePreviewBoot } from "@/hooks/usePreviewBoot";
import { clearEnhancements } from "@/lib/monacoEnhancements";
import { toast } from "sonner";
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
  agentHasRun: boolean;
  devUrl: string | null;
  activeView: "code" | "preview" | "diff";
  setPreviewReloadNonce: (value: number | ((prev: number) => number)) => void;
  tasteQuota: TasteQuota;
  runAgent: (
    explicitKind?: import("@/lib/taste").ForgeSessionKind,
    explicitAction?: import("@/lib/taste").TasteAction,
  ) => boolean;
  fileMap: Map<string, string>;
  editorRef: RefObject<editor.IStandaloneCodeEditor | null>;
  monacoRef: RefObject<typeof import("monaco-editor") | null>;
  previewBoot: PreviewBoot;
  previewIdle: boolean;
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
}: UseEditorAgentOrchestrationParams) {
  /** Evita boot duplicado do preview entre fim do agente e refetch do previewUrl. */
  const previewBootAfterAgentRef = useRef(false);

  useAgentSessionCoordinator({
    projectId,
    conversation,
    agent,
    running,
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
      reviewed: false,
    }));
  }, [agent.progress.diffs, fileMap]);

  const blameEntries = useMemo(
    () => buildBlameFromTimeline(agent.progress.timeline),
    [agent.progress.timeline],
  );
  useAgentBlame({ blameMap: blameEntries, editorRef, monacoRef });

  // ─── Sync running state — uma única fonte de verdade ──
  useEffect(() => {
    const active =
      agent.connected && !agent.progress.finished && !agent.progress.canceled;
    setRunning(active);
  }, [agent.connected, agent.progress.finished, agent.progress.canceled, setRunning]);

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

  useEffect(() => {
    if (agent.progress.error && agent.progress.finished && !agent.progress.resumable) {
      toast.error(agent.progress.error);
      setRunning(false);
    }
    if (
      agent.progress.finished &&
      agent.progress.resumable &&
      agent.progress.error &&
      !agent.progress.autoResuming
    ) {
      toast.warning(agent.progress.error, { duration: 5000 });
      setRunning(false);
    }
  }, [
    agent.progress.error,
    agent.progress.finished,
    agent.progress.resumable,
    agent.progress.autoResuming,
    setRunning,
  ]);

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

  useEffect(() => {
    if (running) {
      previewBootAfterAgentRef.current = false;
      return;
    }
    if (!isReactProject || !e2bConnected || devUrl || previewBoot.booting || previewE2bCircuit) return;
    if (fileCount === 0) return;
    if (!agentShouldBootPreview) return;
    if (previewBootAfterAgentRef.current) return;
    previewBootAfterAgentRef.current = true;
    void previewBoot.bootWithRetry();
  }, [
    agentShouldBootPreview,
    running,
    isReactProject,
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

  useEffect(() => {
    if (!devUrl || activeView !== "preview") return;
    const t = window.setTimeout(() => setPreviewReloadNonce((n) => n + 1), 600);
    return () => window.clearTimeout(t);
  }, [filesSyncKey, devUrl, activeView, setPreviewReloadNonce]);

  return {
    previewE2bCircuit,
    diffEntries,
    blameEntries,
    filesSyncKey,
  };
}