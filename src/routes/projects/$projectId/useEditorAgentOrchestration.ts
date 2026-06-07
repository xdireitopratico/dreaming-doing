import { useEffect, useMemo, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import type { editor } from "monaco-editor";

import { supabase } from "@/integrations/supabase/client";
import { removeRealtimeChannel } from "@/lib/supabase-realtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createLogEntry, type LogEntry } from "@/components/editor/LogPanel";
import type { DiffEntry } from "@/components/editor/AiDiffViewer";
import { useAgentBlame, buildBlameFromTimeline } from "@/hooks/useAgentBlame";
import type { usePreviewBoot } from "@/hooks/usePreviewBoot";
import { clearEnhancements } from "@/lib/monacoEnhancements";
import {
  clearPendingAgentRun,
  peekPendingAgentRun,
} from "@/lib/agent-auto-run";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { resolveSessionKind } from "@/lib/taste";
import { toast } from "sonner";
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
  pendingAgentRunKey: string | null;
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
  pendingAgentRunKey,
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
  const autoAgentRunAttemptedRef = useRef<string | null>(null);
  const queueDrainAttemptedRef = useRef(false);
  /** Evita boot duplicado do preview entre fim do agente e refetch do previewUrl. */
  const previewBootAfterAgentRef = useRef(false);

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

  // ─── Sincroniza contador da fila com o servidor ao abrir o editor
  useEffect(() => {
    if (!conversation?.id) return;
    void agent.syncPendingCount(projectId, conversation.id);
  }, [conversation?.id, projectId, agent]);

  // ─── Auto-run: projeto recém-criado (flag) ou última msg user sem resposta
  // Não espera messages no client — evita race read-after-write após createProject.
  useEffect(() => {
    if (!conversation?.id) return;

    queueDrainAttemptedRef.current = false;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12;

    const tryAutoRun = async () => {
      if (cancelled || attempts >= maxAttempts) return;
      attempts += 1;

      if (running || agent.connected) {
        window.setTimeout(tryAutoRun, 250);
        return;
      }

      const { data: activeRun } = await supabase
        .from("agent_runs")
        .select("id, status")
        .eq("project_id", projectId)
        .in("status", ["running", "pending"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeRun?.id) {
        await agent.watch(projectId, conversation.id, activeRun.id);
        return;
      }

      const { count: pendingQueue } = await supabase
        .from("agent_pending_messages")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);

      if ((pendingQueue ?? 0) > 0) {
        if (!queueDrainAttemptedRef.current && runAgent(resolveSessionKind(tasteQuota))) {
          queueDrainAttemptedRef.current = true;
          logEditorTelemetryEvent("agent", "auto_run_queue_drain", "info", String(pendingQueue));
        }
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
    agent.connected,
    runAgent,
    tasteQuota,
    agent,
  ]);

  useEffect(() => {
    if (!agent.progress.finished || !conversation) return;
    void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });
    void qc.invalidateQueries({ queryKey: ["profile"] });
    void agent.syncPendingCount(projectId, conversation.id);
  }, [agent.progress.finished, conversation, projectId, qc, agent]);

  // Reconecta a run ativo via Realtime (refresh, fila, plan approve) — sem polling.
  useEffect(() => {
    if (!conversation || running || agent.connected) return;

    let channel: RealtimeChannel | null = null;

    const attachIfRunning = async (runId: string) => {
      if (agent.connected) return;
      await agent.watch(projectId, conversation.id, runId);
    };

    void (async () => {
      const { data: activeRun } = await supabase
        .from("agent_runs")
        .select("id, status")
        .eq("project_id", projectId)
        .in("status", ["running", "awaiting_user"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeRun?.id) {
        await attachIfRunning(activeRun.id);
      }
    })();

    channel = supabase
      .channel(`project-runs-${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_runs", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new as { id?: string; status?: string };
          if (row.id && row.status === "running") {
            void attachIfRunning(row.id);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_runs", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new as { id?: string; status?: string };
          if (row.id && (row.status === "running" || row.status === "awaiting_user")) {
            void attachIfRunning(row.id);
          }
        },
      )
      .subscribe();

    return () => {
      if (channel) void removeRealtimeChannel(channel);
    };
  }, [conversation, projectId, running, agent.connected, agent]);

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