import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import { initialAgentProgress } from "@/lib/agent-progress";
import {
  planAwaitingProgressRestore,
  planLiveRunRestore,
} from "@/hooks/agent-run/agent-run-restore";

const now = Date.now();

describe("planLiveRunRestore", () => {
  it("subscribe quando run live e heartbeat fresco", () => {
    const plan = planLiveRunRestore(
      {
        id: "run-1",
        status: "running",
        heartbeat_at: new Date(now - 30_000).toISOString(),
        started_at: new Date(now - 120_000).toISOString(),
        canceled_at: null,
      },
      null,
      [],
    );
    expect(plan).toEqual({ kind: "subscribe", runId: "run-1" });
  });

  it("none quando run já materializado no DB", () => {
    const messages: ChatMessage[] = [
      {
        id: "m1",
        role: "assistant",
        content: "Pronto.",
        timestamp: 0,
        runId: "run-1",
        meta: { finishedAt: "2026-06-08T00:00:00Z", runId: "run-1" },
      },
    ];
    const plan = planLiveRunRestore(
      {
        id: "run-1",
        status: "running",
        heartbeat_at: new Date(now - 30_000).toISOString(),
        started_at: new Date(now - 120_000).toISOString(),
        canceled_at: null,
      },
      null,
      messages,
    );
    expect(plan).toEqual({ kind: "none" });
  });
});

describe("planAwaitingProgressRestore", () => {
  it("restaura gate plan_approval de mensagem não materializada", () => {
    const messages: ChatMessage[] = [
      {
        id: "m1",
        role: "assistant",
        content: "Plano proposto",
        timestamp: 0,
        runId: "run-plan",
        meta: {
          runId: "run-plan",
          cardSnapshot: {
            awaiting: true,
            awaitingKind: "plan_approval",
            pendingPlan: {
              planId: "p1",
              summary: "Plano",
              steps: [{ id: "s1", title: "Step", status: "pending" }],
              runId: "run-plan",
              projectId: "proj",
            },
          },
        },
      },
    ];
    const progress = planAwaitingProgressRestore(messages);
    expect(progress?.awaitingKind).toBe("plan_approval");
    expect(progress?.finished).toBe(true);
  });

  it("retorna null sem awaiting", () => {
    expect(planAwaitingProgressRestore([])).toBeNull();
    expect(
      planAwaitingProgressRestore([
        {
          id: "m1",
          role: "assistant",
          content: "",
          timestamp: 0,
          meta: {},
        },
      ]),
    ).toBeNull();
  });
});