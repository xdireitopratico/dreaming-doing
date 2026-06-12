import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import { initialAgentProgress } from "@/lib/agent-progress";
import { collectStatusChips } from "@/lib/forge-run";
import { mapAssistantTurn } from "@/lib/chat/turn";
import type { RawThreadItem } from "@/lib/chat/types";

function msg(id: string, role: ChatMessage["role"], content: string, extra?: Partial<ChatMessage>): ChatMessage {
  return { id, role, content, timestamp: 0, ...extra };
}

describe("collectStatusChips — Lovable img 4/15", () => {
  it("ativo: até 2 chips de tools pendentes (img 4)", () => {
    const chips = collectStatusChips(
      {
        ...initialAgentProgress,
        finished: false,
        tools: [
          { name: "fs_read", args: { path: "lara-workspace/routes.ts" } },
          { name: "fs_glob", args: { pattern: "browser/**" } },
          { name: "fs_read", args: { path: "Dockerfile.lara" }, ok: true },
        ],
      },
      true,
    );
    expect(chips.length).toBeLessThanOrEqual(2);
    expect(chips[0]).toMatch(/Reading|Searching/i);
  });

  it("ativo: message + statusHint viram 2 pills (img 4)", () => {
    const chips = collectStatusChips(
      {
        ...initialAgentProgress,
        finished: false,
        phase: "gather",
        message: "Checking browser route wiring in lara-workspace",
        statusHint: "Diagnosing Lara container gaps and needs",
        tools: [],
      },
      true,
    );
    expect(chips).toHaveLength(2);
    expect(chips[0]).toContain("Checking browser route");
    expect(chips[1]).toContain("Diagnosing Lara container");
  });

  it("terminal: chips de plano permanecem (img 15)", () => {
    const chips = collectStatusChips(
      {
        ...initialAgentProgress,
        finished: true,
        awaitingKind: "plan_approval",
        pendingPlan: {
          planId: "p1",
          summary: "Defining cross-view deletion strategy planning",
          mission: "Desbloquear exclusão do documento travado (vínculo com proposta no banco)",
          steps: [{ id: "s1", type: "custom", description: "Step", enabled: true }],
          ttlMs: 99999,
          proposedAt: Date.now(),
          runId: "run-plan",
          projectId: "proj",
        },
      },
      false,
    );
    expect(chips[0]).toBe("Reading approved plan");
    expect(chips[1]).toBe("Defining cross-view deletion strategy planning");
    expect(chips[2]).toMatch(/^Plan: Desbloquear exclusão/);
  });

  it("usa storedChips do cardSnapshot quando presente", () => {
    const chips = collectStatusChips(
      { ...initialAgentProgress, finished: true },
      false,
      { storedChips: ["Reading approved plan", "Plan: Missão curta"] },
    );
    expect(chips).toEqual(["Reading approved plan", "Plan: Missão curta"]);
  });
});

describe("mapAssistantTurn — status chips persistem", () => {
  it("mantém chips após terminal com plano (img 15)", () => {
    const progress = {
      ...initialAgentProgress,
      finished: true,
      awaitingKind: "plan_approval" as const,
      pendingPlan: {
        planId: "p1",
        summary: "Defining cross-view deletion strategy planning",
        mission: "Desbloquear exclusão do documento travado",
        steps: [{ id: "s1", type: "custom" as const, description: "Step", enabled: true }],
        ttlMs: 99999,
        proposedAt: Date.now(),
        runId: "run-plan",
        projectId: "proj",
      },
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
            statusChips: [
              "Reading approved plan",
              "Defining cross-view deletion strategy planning",
              "Plan: Desbloquear exclusão do documento travado",
            ],
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
      pendingPlan: progress.pendingPlan,
    });

    expect(turn.statusChips).toHaveLength(3);
    expect(turn.statusChips?.[0]).toBe("Reading approved plan");
    expect(turn.statusChips?.[2]).toMatch(/^Plan:/);
  });
});