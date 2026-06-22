import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import { initialAgentProgress } from "@/lib/agent-progress";
import { mapAssistantTurn } from "@/lib/chat/turn";
import { assertAssistantTurnInvariant } from "@/lib/chat/invariants";
import type { RawThreadItem, ThreadItem } from "@/lib/chat/types";

function msg(id: string, role: ChatMessage["role"], content: string, extra?: Partial<ChatMessage>): ChatMessage {
  return { id, role, content, timestamp: 0, ...extra };
}

function assistantCtx(
  thread: RawThreadItem[],
  itemIndex: number,
  overrides: Partial<Parameters<typeof mapAssistantTurn>[1]> = {},
) {
  const messages = thread
    .filter((t) => t.kind === "user")
    .map((t) => (t.kind === "user" ? t.message : msg("u", "user", "")));
  return {
    messages,
    thread,
    itemIndex,
    running: false,
    activeRunId: null,
    sessionProgress: initialAgentProgress,
    ...overrides,
  };
}

describe("assertAssistantTurnInvariant", () => {
  const base: Extract<ThreadItem, { kind: "assistant" }> = {
    kind: "assistant",
    runId: "r1",
    isActive: false,
    streamText: null,
  };

  it("rejeita fechamento durante run ativa com mini-card", () => {
    expect(() =>
      assertAssistantTurnInvariant({
        ...base,
        isActive: true,
        streamText: "Pronto!",
        miniCard: {
          title: "t",
          header: "Working",
          subtitle: "s",
          liveBriefings: ["s"],
          status: "working",
          tasks: [],
          activity: [],
          currentTaskIndex: 0,
        },
      }),
    ).toThrow(/closing prose only after job/);
  });
});

describe("mapAssistantTurn — contrato Lovable imutável", () => {
  it("run ativa: Thought → narração LLM → mini-card", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "build" as const,
      finished: false,
      narrationText: "Vou investigar o estado atual.",
      message: "Checking browser route wiring in lara-workspace",
      statusHint: "Diagnosing Lara container gaps and needs",
    };
    const thread: RawThreadItem[] = [
      { kind: "user", message: msg("u1", "user", "higienizar") },
      { kind: "assistant", live: progress, runId: "run-1", isActive: true },
    ];

    const turn = mapAssistantTurn(thread[1] as Extract<RawThreadItem, { kind: "assistant" }>, {
      ...assistantCtx(thread, 1),
      running: true,
      activeRunId: "run-1",
      sessionProgress: progress,
    });

    expect(turn.miniCard).not.toBeNull();
    expect(turn.miniCard?.header).toBe("Working");
    expect(turn.narration).toBe("Vou investigar o estado atual.");
    expect(turn.streamText).toBeNull();
    assertAssistantTurnInvariant(turn);
  });

  it("run ativa com activeRunStartedAtMs: exibe Pensando", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "build" as const,
      finished: false,
    };
    const thread: RawThreadItem[] = [
      { kind: "user", message: msg("u1", "user", "oi") },
      { kind: "assistant", live: progress, runId: "run-1", isActive: true },
    ];
    const startedAt = Date.now() - 800;
    const turn = mapAssistantTurn(thread[1] as Extract<RawThreadItem, { kind: "assistant" }>, {
      ...assistantCtx(thread, 1),
      running: true,
      activeRunId: "run-1",
      activeRunStartedAtMs: startedAt,
      sessionProgress: progress,
    });
    expect(turn.working).toEqual({ status: "active" });
    assertAssistantTurnInvariant(turn);
  });

  it("Estado C img5: mini-card Edited, sem chips", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "execute" as const,
      finished: false,
      tools: [{ name: "fs_edit", args: { path: "Dockerfile.lara" }, ok: true }],
      diffs: [
        {
          id: "diff-1",
          path: "Dockerfile.lara",
          before: "",
          after: "...",
          op: "edit" as const,
          timestamp: 1,
        },
      ],
      message: "Checking browser route wiring",
      statusHint: "Diagnosing Lara container gaps",
    };
    const thread: RawThreadItem[] = [
      { kind: "assistant", live: progress, runId: "run-1", isActive: true },
    ];

    const turn = mapAssistantTurn(thread[0] as Extract<RawThreadItem, { kind: "assistant" }>, {
      ...assistantCtx(thread, 0),
      running: true,
      activeRunId: "run-1",
      sessionProgress: progress,
    });

    expect(turn.miniCard).not.toBeNull();
    expect(turn.miniCard?.header).toMatch(/^Edited /);
    assertAssistantTurnInvariant(turn);
  });

  it("Estado C img9: Running command, sem chips", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "execute" as const,
      finished: false,
      tools: [{ name: "shell_exec", args: { command: "deploy" } }],
    };
    const thread: RawThreadItem[] = [
      { kind: "assistant", live: progress, runId: "run-1", isActive: true },
    ];

    const turn = mapAssistantTurn(thread[0] as Extract<RawThreadItem, { kind: "assistant" }>, {
      ...assistantCtx(thread, 0),
      running: true,
      activeRunId: "run-1",
      sessionProgress: progress,
    });

    expect(turn.miniCard?.header).toBe("Running command");
    assertAssistantTurnInvariant(turn);
  });

  it("Estado D img14: plan teaser, sem chips", () => {
    const plan = {
      planId: "p1",
      summary: "Defining cross-view deletion strategy planning",
      steps: [{ id: "s1", type: "custom" as const, description: "Step", enabled: true }],
      ttlMs: 60_000,
      proposedAt: Date.now(),
      runId: "run-plan",
      projectId: "proj",
    };
    const progress = {
      ...initialAgentProgress,
      finished: false,
      awaitingKind: "plan_approval" as const,
      pendingPlan: plan,
    };
    const thread: RawThreadItem[] = [
      { kind: "assistant", live: progress, runId: "run-plan", isActive: true },
    ];

    const turn = mapAssistantTurn(thread[0] as Extract<RawThreadItem, { kind: "assistant" }>, {
      ...assistantCtx(thread, 0),
      running: true,
      activeRunId: "run-plan",
      pendingPlan: plan,
      sessionProgress: progress,
    });

    expect(turn.miniCard).toBeNull();
    assertAssistantTurnInvariant(turn);
  });

  it("turn histórico não herda sessionProgress do run ativo", () => {
    const staleSession = {
      ...initialAgentProgress,
      streamText: "Plano: landing viva e convertendo",
      narrationText: "Missão: entregar landing viva",
      workingDurationMs: 83_000,
      finished: false,
    };
    const messages = [
      msg("u1", "user", "landing"),
      msg("a1", "assistant", "Texto persistido do plano.", {
        runId: "run-plan",
        meta: { runId: "run-plan", finishedAt: new Date().toISOString() },
      }),
    ];
    const thread: RawThreadItem[] = [
      { kind: "user", message: messages[0] },
      { kind: "assistant", message: messages[1], runId: "run-plan", isActive: false },
    ];

    const turn = mapAssistantTurn(thread[1] as Extract<RawThreadItem, { kind: "assistant" }>, {
      messages,
      thread,
      itemIndex: 1,
      running: true,
      activeRunId: "run-build",
      sessionProgress: staleSession,
    });

    expect(turn.streamText).not.toBe("Plano: landing viva e convertendo");
    expect(turn.narration).not.toBe("Missão: entregar landing viva");
  });

  it("plano pendente no dock: sem corpo duplicado no streamText do thread", () => {
    const plan = {
      planId: "p1",
      summary: "Landing viva e convertendo",
      mission:
        "Malandro, impede, que transmite confiança, técnica, encantamento humano, fundo creme, quente, com blobs animados, petróleo âmbar.",
      steps: [{ id: "s1", type: "custom" as const, description: "Step", enabled: true }],
      ttlMs: 60_000,
      proposedAt: Date.now(),
      runId: "run-plan",
      projectId: "proj",
    };
    const progress = {
      ...initialAgentProgress,
      finished: true,
      awaitingKind: "plan_approval" as const,
      pendingPlan: plan,
      streamText: plan.mission,
    };
    const thread: RawThreadItem[] = [
      { kind: "assistant", live: progress, runId: "run-plan", isActive: false },
    ];

    const turn = mapAssistantTurn(thread[0] as Extract<RawThreadItem, { kind: "assistant" }>, {
      ...assistantCtx(thread, 0),
      running: false,
      activeRunId: null,
      pendingPlan: plan,
      sessionProgress: progress,
    });

    expect(turn.streamText).toBeNull();
    expect(turn.miniCard).toBeNull();
  });

  it("Terminal img15: plano pendente, sem mini-card", () => {
    const plan = {
      planId: "p1",
      summary: "Defining cross-view deletion strategy planning",
      mission: "Desbloquear exclusão do documento travado (vínculo com proposta no banco)",
      steps: [{ id: "s1", type: "custom" as const, description: "Step", enabled: true }],
      ttlMs: 60_000,
      proposedAt: Date.now(),
      runId: "run-plan",
      projectId: "proj",
    };
    const progress = {
      ...initialAgentProgress,
      finished: true,
      awaitingKind: "plan_approval" as const,
      pendingPlan: plan,
    };
    const messages = [
      msg("u1", "user", "fix delete"),
      msg("a1", "assistant", "", {
        runId: "run-plan",
        meta: {
          finishedAt: new Date().toISOString(),
          runId: "run-plan",
          cardSnapshot: {
            ...progress,
          },
        },
      }),
    ];
    const thread: RawThreadItem[] = [
      { kind: "user", message: messages[0] },
      { kind: "assistant", message: messages[1], runId: "run-plan", isActive: false },
    ];

    const turn = mapAssistantTurn(thread[1] as Extract<RawThreadItem, { kind: "assistant" }>, {
      messages,
      thread,
      itemIndex: 1,
      running: false,
      activeRunId: null,
      sessionProgress: initialAgentProgress,
      pendingPlan: plan,
    });

    expect(turn.miniCard).toBeNull();
    assertAssistantTurnInvariant(turn);
  });
});