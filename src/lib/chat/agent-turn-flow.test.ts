/**
 * S15 — Fluxo e2e (vitest): Thought → Narração → Mini-card → Fechamento → F5.
 * Simula eventos SSE + buildChatThread sem browser.
 */
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import {
  applyAgentProgressEvent,
  initialAgentProgress,
  type AgentProgress,
} from "@/lib/agent-progress";
import { buildChatThread } from "@/lib/chat/thread";
import { assertAssistantTurnInvariant } from "@/lib/chat/invariants";
import { collapseNarrationBuffer } from "@/lib/narration-dedupe";

function ev(type: string, data: Record<string, unknown>) {
  return { type, data, timestamp: Date.now() };
}

function reduce(events: Array<ReturnType<typeof ev>>): AgentProgress {
  return events.reduce((p, e) => applyAgentProgressEvent(p, e), initialAgentProgress);
}

describe("S15 agent turn flow", () => {
  it("live: Thought → narração → mini-card → fechamento", () => {
    const runId = "run-flow-live";
    const startedAt = Date.now() - 1200;

    let progress = reduce([
      ev("start", {}),
      ev("assistant_text", { text: "Entendi", delta: true, thinking: true }),
      ev("assistant_text", { text: ": vou montar a landing.", delta: true, thinking: true }),
      ev("assistant_text", {
        text: "Vou montar o hero da oficina.",
        opening: true,
      }),
      ev("tool_start", { name: "fs_write", args: { path: "src/App.tsx" } }),
      ev("tool_done", { name: "fs_write", ok: true }),
      ev("assistant_text", { text: "Pronto — confere o preview.", final: true }),
      ev("done", { summary: "Pronto — confere o preview." }),
    ]);
    progress = { ...progress, finished: true, streamText: "Pronto — confere o preview.", workingDurationMs: 4800 };

    const messages: ChatMessage[] = [msg("u1", "user", "landing oficina")];
    const thread = buildChatThread(messages, progress, {
      running: false,
      activeRunId: runId,
      activeRunStartedAtMs: startedAt,
      sessionProgress: progress,
    });

    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant"]);
    const turn = thread[1];
    expect(turn?.kind).toBe("assistant");
    if (turn?.kind !== "assistant") return;

    expect(turn.thinking?.status).toBe("done");
    expect(turn.narration).toContain("hero");
    expect(turn.narration).not.toMatch(/hero[\s\S]*hero/i);
    expect(turn.miniCard).toBeTruthy();
    expect(turn.streamText).toContain("Pronto");
    assertAssistantTurnInvariant(turn);
  });

  it("F5: mensagem materializada reidrata mini-card e narração", () => {
    const messages: ChatMessage[] = [
      msg("u1", "user", "cria landing"),
      {
        id: "a1",
        role: "assistant",
        content: "Pronto — landing da oficina.",
        timestamp: 0,
        runId: "run-f5",
        meta: {
          runId: "run-f5",
          partial: false,
          finishedAt: "2026-06-12T12:00:00Z",
          narrationText: "Entendi: vou criar.\n\nEntendi: vou ajustar cores.",
          workingDurationMs: 2400,
          streamTail: [
            {
              type: "tool_start",
              data: { name: "fs_write", args: { path: "src/App.tsx" } },
              timestamp: 1,
            },
          ],
          cardSnapshot: {
            timeline: [],
            tools: [{ name: "fs_write", args: { path: "src/App.tsx" }, ok: true }],
            finished: true,
            streamText: "Pronto — landing da oficina.",
            narrationText: "Entendi: vou criar.\n\nEntendi: vou ajustar cores.",
            workingDurationMs: 2400,
          },
        },
      },
    ];

    const thread = buildChatThread(messages, initialAgentProgress, {
      running: false,
      activeRunId: null,
      sessionProgress: initialAgentProgress,
    });

    const turn = thread[1];
    expect(turn?.kind).toBe("assistant");
    if (turn?.kind !== "assistant") return;

    expect(turn.narration).toBe("Entendi: vou criar.");
    expect(turn.miniCard).toBeTruthy();
    expect(turn.streamText).toContain("Pronto");
    assertAssistantTurnInvariant(turn);
  });

  it("ordem: user sempre antes de assistant live (narração órfã no DB)", () => {
    const messages: ChatMessage[] = [
      {
        id: "a-orphan",
        role: "assistant",
        content: "",
        timestamp: 0,
        parts: [{ type: "text", text: "Entendi: vou ler o arquivo." }],
      },
      msg("u1", "user", "continua o build"),
    ];
    const progress = {
      ...initialAgentProgress,
      finished: false,
      narrationText: "Conferindo build…",
      statusHint: "Trabalhando…",
    };

    const thread = buildChatThread(messages, progress, {
      running: true,
      activeRunId: "run-order",
      sessionProgress: progress,
    });

    expect(thread[0]?.kind).toBe("user");
    expect(thread[1]?.kind).toBe("assistant");
    if (thread[1]?.kind === "assistant") {
      expect(thread[1].runId).toBe("run-order");
      expect(thread[1].isActive).toBe(true);
    }
  });

  it("run ativa sem conteúdo: linha Pensando", () => {
    const startedAt = Date.now() - 900;
    const progress = {
      ...initialAgentProgress,
      phase: "build" as const,
      finished: false,
    };
    const thread = buildChatThread([msg("u1", "user", "landing")], progress, {
      running: true,
      activeRunId: "run-pensando",
      activeRunStartedAtMs: startedAt,
      sessionProgress: progress,
    });
    const turn = thread[1];
    expect(turn?.kind).toBe("assistant");
    if (turn?.kind !== "assistant") return;
    expect(turn.thinking).toEqual({ status: "active" });
  });

  it("loop natural: abertura no chat, progresso factual só no inspector", () => {
    let progress = reduce([
      ev("start", {}),
      ev("assistant_text", { text: "Montando o hero da landing.", opening: true }),
      ev("tool_start", { name: "fs_write", args: { path: "src/App.tsx" } }),
      ev("tool_done", { name: "fs_write", ok: true }),
      ev("phase", {
        phase: "checkpoint",
        message: "Concluído: criar `src/App.tsx` (passo 1/5).",
      }),
      ev("assistant_text", { text: "Pronto — confere o preview.", final: true }),
      ev("done", { summary: "Pronto — confere o preview." }),
    ]);
    progress = { ...progress, finished: true, streamText: "Pronto — confere o preview." };

    const thread = buildChatThread([msg("u1", "user", "landing oficina")], progress, {
      running: false,
      activeRunId: "run-factual",
      sessionProgress: progress,
    });
    const turn = thread[1];
    expect(turn?.kind).toBe("assistant");
    if (turn?.kind !== "assistant") return;

    expect(turn.narration).toContain("Montando o hero");
    expect(turn.narration).not.toContain("Concluído: criar");
    expect(turn.streamText).toContain("Pronto");
    expect(turn.miniCard).toBeTruthy();
  });

  it("collapseNarrationBuffer — parede Entendi não vaza ao display", () => {
    const wall =
      "Entendi: A\n\nEntendi: B\n\nEntendi: C\n\nBuild passou.";
    expect(collapseNarrationBuffer(wall)).toBe("Entendi: A\n\nBuild passou.");
  });
});

function msg(id: string, role: ChatMessage["role"], content: string): ChatMessage {
  return { id, role, content, timestamp: 0 };
}