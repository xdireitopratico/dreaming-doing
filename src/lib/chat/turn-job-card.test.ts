import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import { initialAgentProgress } from "@/lib/agent-progress";
import { mapAssistantTurn } from "@/lib/chat/turn";
import type { RawThreadItem } from "@/lib/chat/types";

function msg(id: string, role: ChatMessage["role"], content: string, extra?: Partial<ChatMessage>): ChatMessage {
  return { id, role, content, timestamp: 0, ...extra };
}

describe("mapAssistantTurn — mini-card permanece", () => {
  it("mantém mini-card após terminal com cardSnapshot", () => {
    const messages = [
      msg("u1", "user", "build"),
      msg("a1", "assistant", "Pronto.", {
        runId: "run-1",
        meta: {
          finishedAt: new Date().toISOString(),
          runId: "run-1",
          cardSnapshot: {
            finished: true,
            lastFinishOk: true,
            timeline: [],
            tools: [{ name: "fs_read", args: { path: "Dockerfile.lara" }, ok: true }],
            diffs: [],
            streamText: "Pronto.",
            workingDurationMs: 4000,
            narrationText: "Vou investigar o estado atual.",
          },
        },
      }),
    ];

    const thread: RawThreadItem[] = [
      { kind: "user", message: messages[0] },
      { kind: "assistant", message: messages[1], runId: "run-1", isActive: false },
    ];

    const turn = mapAssistantTurn(thread[1] as Extract<RawThreadItem, { kind: "assistant" }>, {
      messages,
      thread,
      itemIndex: 1,
      running: false,
      activeRunId: null,
      sessionProgress: initialAgentProgress,
    });

    expect(turn.miniCard).not.toBeNull();
    expect(turn.narration).toBe("Vou investigar o estado atual.");
  });

  it("plan approval não mostra mini-card no thread (dock separado)", () => {
    const progress = {
      ...initialAgentProgress,
      finished: false,
      awaitingKind: "plan_approval" as const,
      awaiting: true,
      pendingPlan: {
        planId: "p1",
        summary: "Defining cross-view deletion strategy planning",
        steps: [{ id: "s1", type: "custom" as const, description: "Step 1", enabled: true }],
        ttlMs: 99999,
        proposedAt: Date.now(),
        runId: "run-plan",
        projectId: "proj",
      },
    };

    const thread: RawThreadItem[] = [
      { kind: "user", message: msg("u1", "user", "fix delete") },
      {
        kind: "assistant",
        live: progress,
        runId: "run-plan",
        isActive: true,
      },
    ];

    const turn = mapAssistantTurn(thread[1] as Extract<RawThreadItem, { kind: "assistant" }>, {
      messages: [thread[0].kind === "user" ? thread[0].message : msg("u1", "user", "")],
      thread,
      itemIndex: 1,
      running: true,
      activeRunId: "run-plan",
      pendingPlan: progress.pendingPlan,
      sessionProgress: progress,
    });

    expect(turn.miniCard).toBeNull();
  });

  it("marca isFocused quando focusedRunId coincide com runId", () => {
    const messages = [
      msg("u1", "user", "build"),
      msg("a1", "assistant", "Pronto.", {
        runId: "run-1",
        meta: {
          finishedAt: new Date().toISOString(),
          runId: "run-1",
          cardSnapshot: {
            finished: true,
            lastFinishOk: true,
            timeline: [{ type: "tool_start", data: { name: "fs_read" }, timestamp: 1 }],
            tools: [{ name: "fs_read", args: { path: "a.ts" }, ok: true }],
            diffs: [],
          },
        },
      }),
    ];

    const thread: RawThreadItem[] = [
      { kind: "user", message: messages[0] },
      { kind: "assistant", message: messages[1], runId: "run-1", isActive: false },
    ];

    const turn = mapAssistantTurn(thread[1] as Extract<RawThreadItem, { kind: "assistant" }>, {
      messages,
      thread,
      itemIndex: 1,
      running: false,
      activeRunId: "run-2",
      focusedRunId: "run-1",
      sessionProgress: initialAgentProgress,
    });

    expect(turn.isFocused).toBe(true);
  });
});