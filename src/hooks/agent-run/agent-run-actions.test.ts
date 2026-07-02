import { describe, expect, it } from "vitest";
import { createRunActionHandlers } from "./agent-run-actions";
import { initialAgentProgress, type AgentProgress } from "@/lib/agent-progress";

describe("createRunActionHandlers", () => {
  it("clearPendingPlan limpa o estado visual de aprovação", () => {
    let progress: AgentProgress = {
      ...initialAgentProgress,
      pendingPlan: {
        planId: "p-1",
        summary: "Plano em aprovação",
        steps: [],
        ttlMs: 60_000,
        proposedAt: Date.now(),
        runId: "run-1",
        projectId: "proj-1",
      },
      awaiting: true,
      awaitingKind: "plan_approval",
      phase: "plan",
      statusHint: "Plano aguardando aprovação…",
    };

    const handlers = createRunActionHandlers({
      runIdRef: { current: null },
      closedRunIdRef: { current: null },
      lastSeqRef: { current: 0 },
      appliedSeqsRef: { current: new Set<number>() },
      setProgress: (next) => {
        progress = typeof next === "function" ? next(progress) : next;
      },
      setConnected: () => {},
      setActiveRunId: () => {},
      teardownChannels: () => {},
      finalizeLiveRunSession: () => {},
    });

    handlers.clearPendingPlan();

    expect(progress.pendingPlan).toBeNull();
    expect(progress.awaiting).toBe(false);
    expect(progress.awaitingKind).toBeNull();
    expect(progress.phase).toBeNull();
    expect(progress.statusHint).toBeNull();
  });

  it("acknowledgeMaterializedRun encerra a sessao live apenas apos materializacao", () => {
    let finalizedRunId: string | null = null;

    const handlers = createRunActionHandlers({
      runIdRef: { current: "run-1" },
      closedRunIdRef: { current: null },
      lastSeqRef: { current: 0 },
      setProgress: () => {},
      setConnected: () => {},
      setActiveRunId: () => {},
      teardownChannels: () => {},
      finalizeLiveRunSession: (runId) => {
        finalizedRunId = runId;
      },
    });

    handlers.acknowledgeMaterializedRun("run-1");

    expect(finalizedRunId).toBe("run-1");
  });
});
