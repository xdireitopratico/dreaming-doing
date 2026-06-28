import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatAgentFetchError } from "@/lib/agent-fetch-errors";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { cancelAgentRun } from "@/lib/agent-cancel";
import {
  type AgentProgress,
  type PendingPlan,
  applyAgentProgressEvent,
  initialAgentProgress,
  streamRowToSSEEvent,
} from "@/lib/agent-progress";
export type RunActionHandlersDeps = {
  runIdRef: MutableRefObject<string | null>;
  closedRunIdRef: MutableRefObject<string | null>;
  lastSeqRef: MutableRefObject<number>;
  setProgress: Dispatch<SetStateAction<AgentProgress>>;
  setConnected: Dispatch<SetStateAction<boolean>>;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  teardownChannels: () => void;
  freezeRunProgress: (runId: string) => void;
};

export function createRunActionHandlers(deps: RunActionHandlersDeps) {
  const stop = async () => {
    const runId = deps.runIdRef.current;
    if (runId) deps.closedRunIdRef.current = runId;

    deps.setProgress((p) => ({
      ...p,
      finished: true,
      canceled: true,
      resumable: false,
      statusHint: "Cancelando…",
    }));
    deps.setConnected(false);

    if (runId) {
      try {
        await cancelAgentRun(runId);
        logEditorTelemetryEvent("agent", "cancel_request", "info", runId.slice(0, 8));
        deps.setProgress((p) => ({
          ...p,
          error: null,
          statusHint: "Cancelado pelo usuário",
          finished: true,
          canceled: true,
        }));
      } catch (e) {
        deps.setProgress((p) => ({
          ...p,
          error: formatAgentFetchError(e),
          statusHint: "Falha ao cancelar — tente novamente",
          finished: true,
          canceled: false,
          resumable: true,
        }));
      }
    }

    deps.runIdRef.current = null;
    deps.setActiveRunId(null);
    deps.teardownChannels();
  };

  const disconnect = () => {
    if (deps.runIdRef.current) deps.closedRunIdRef.current = deps.runIdRef.current;
    deps.runIdRef.current = null;
    deps.setActiveRunId(null);
    deps.teardownChannels();
    deps.setProgress((p) => ({ ...p, finished: true }));
  };

  const replay = async (projectId: string, conversationId: string, runId: string) => {
    void projectId;
    void conversationId;
    deps.teardownChannels();
    deps.setProgress({
      ...initialAgentProgress,
      statusHint: `Replaying run ${runId.slice(0, 8)}…`,
    });
    deps.runIdRef.current = runId;
    deps.lastSeqRef.current = 0;

    try {
      const { data, error } = await supabase
        .from("agent_stream_events")
        .select("seq, event_type, payload, created_at")
        .eq("run_id", runId)
        .order("seq", { ascending: true });

      if (error) {
        deps.setProgress((p) => ({ ...p, error: error.message, finished: true }));
        return;
      }

      let next = initialAgentProgress;
      for (const row of data ?? []) {
        const event = streamRowToSSEEvent({
          event_type: row.event_type as string,
          payload: (row.payload ?? {}) as Record<string, unknown>,
          created_at: row.created_at as string | undefined,
          seq: row.seq as number,
        });
        next = applyAgentProgressEvent(next, event);
        deps.lastSeqRef.current = row.seq as number;
      }
      deps.setProgress(next);
    } finally {
      deps.setConnected(false);
    }
  };

  const clearPendingPlan = () => {
    deps.setProgress((p) => ({
      ...p,
      pendingPlan: null,
      awaiting: false,
      awaitingKind: null,
    }));
  };

  const hydratePendingPlan = (plan: PendingPlan) => {
    deps.setProgress((p) => ({
      ...p,
      pendingPlan: plan,
      awaiting: true,
      awaitingKind: "plan_approval",
      statusHint: "Plano aguardando aprovação…",
    }));
  };

  const acknowledgeMaterializedRun = (runId: string) => {
    deps.freezeRunProgress(runId);
    deps.setActiveRunId((cur) => {
      if (cur === runId) {
        deps.runIdRef.current = null;
        return null;
      }
      return cur;
    });
  };

  return {
    stop,
    disconnect,
    replay,
    clearPendingPlan,
    hydratePendingPlan,
    acknowledgeMaterializedRun,
  };
}
