import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase-realtime";
import type { useAgentRun } from "@/hooks/useAgentRun";

type AgentRun = ReturnType<typeof useAgentRun>;

const RECONCILE_POLL_MS = 500;
const RECONCILE_WINDOW_MS = 5000;

async function fetchLiveRunForConversation(
  projectId: string,
  conversationId: string,
): Promise<string | null> {
  const { data: run } = await supabase
    .from("agent_runs")
    .select("id, status")
    .eq("project_id", projectId)
    .eq("conversation_id", conversationId)
    .in("status", ["running", "pending"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return run?.id ?? null;
}

/**
 * Reconcile DB agent_runs vs client UI + auto-watch após drain server-side da fila.
 */
export function useAgentRunReconcile(
  projectId: string,
  conversationId: string | undefined,
  agent: AgentRun,
) {
  const { watch, syncPendingCount, activeRunId, progress, isPendingRun } = agent;

  useEffect(() => {
    if (!conversationId) return;
    // Não compete com o envio otimista em andamento: se já existe um slot
    // pendente ("Pensando…"), o reconcile deve ficar quieto e deixar o connect
    // original assumir a run que será criada no DB.
    if (isPendingRun) return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const tryAttach = async (): Promise<boolean> => {
      const runId = await fetchLiveRunForConversation(projectId, conversationId);
      if (cancelled || !runId) return false;
      if (activeRunId === runId && !progress.finished) return true;
      if (!activeRunId || progress.finished) {
        await watch(projectId, conversationId, runId);
      }
      return true;
    };

    void (async () => {
      const deadline = Date.now() + RECONCILE_WINDOW_MS;
      while (!cancelled && Date.now() < deadline) {
        if (await tryAttach()) return;
        await new Promise((resolve) => setTimeout(resolve, RECONCILE_POLL_MS));
      }
    })();

    channel = subscribePostgresChanges({
      channelName: `agent-runs-reconcile-${projectId}-${conversationId}`,
      table: "agent_runs",
      filter: `conversation_id=eq.${conversationId}`,
      onChange: () => {
        void tryAttach();
      },
    });

    return () => {
      cancelled = true;
      removeRealtimeChannel(channel);
    };
  }, [projectId, conversationId, watch, activeRunId, progress.finished, isPendingRun]);

  useEffect(() => {
    if (!conversationId) return;
    if (!progress.finished) return;
    if ((progress.pendingQueueCount ?? 0) <= 0) return;

    let cancelled = false;

    const attachQueuedRun = async () => {
      if (cancelled) return;
      const runId = await fetchLiveRunForConversation(projectId, conversationId);
      if (!runId || cancelled) return;
      if (activeRunId === runId && !progress.finished) return;
      await watch(projectId, conversationId, runId);
      void syncPendingCount(projectId, conversationId);
    };

    void attachQueuedRun();
    const interval = window.setInterval(() => void attachQueuedRun(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    projectId,
    conversationId,
    progress.finished,
    progress.pendingQueueCount,
    activeRunId,
    watch,
    syncPendingCount,
  ]);
}
