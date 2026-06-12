import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import { initialAgentProgress } from "@/lib/agent-progress";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";
import { buildChatThread } from "@/lib/chat/thread";

function msg(id: string, role: ChatMessage["role"], content: string): ChatMessage {
  return { id, role, content, timestamp: 0 };
}

describe("buildChatThread", () => {
  it("ordem cronológica estrita do DB", () => {
    const messages = [
      msg("u1", "user", "oi"),
      msg("a1", "assistant", "olá"),
      msg("u2", "user", "mais"),
      msg("a2", "assistant", "ok"),
    ];
    const thread = buildChatThread(messages, initialAgentProgress, {
      sessionProgress: initialAgentProgress,
    });
    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("slot __pending__ imediato após envio", () => {
    const messages = [msg("u1", "user", "bom dia")];
    const progress = { ...initialAgentProgress, statusHint: "Iniciando…" };
    const thread = buildChatThread(messages, progress, {
      running: true,
      activeRunId: PENDING_RUN_ID,
      sessionProgress: progress,
    });
    expect(thread).toHaveLength(2);
    const slot = thread[1];
    expect(slot.kind).toBe("assistant");
    if (slot.kind === "assistant") {
      expect(slot.runId).toBe(PENDING_RUN_ID);
      expect(slot.isActive).toBe(true);
    }
  });

  it("congela progresso live no slot quando cardSnapshot ainda não existe", () => {
    const messages = [
      msg("u1", "user", "oi"),
      {
        id: "a1",
        role: "assistant" as const,
        content: "Olá!",
        timestamp: 0,
        runId: "run-1",
        meta: { finishedAt: new Date().toISOString(), runId: "run-1" },
      },
    ];
    const progress = {
      ...initialAgentProgress,
      finished: true,
      latencyThoughtMs: 3800,
      narrationText: "Vou investigar o estado atual.",
      streamText: "Olá!",
    };
    const thread = buildChatThread(messages, progress, {
      running: false,
      activeRunId: "run-1",
      sessionProgress: progress,
    });
    const turn = thread[1];
    expect(turn.kind).toBe("assistant");
    if (turn.kind === "assistant") {
      expect(turn.thinking?.durationMs).toBe(3800);
      expect(turn.narration).toBe("Vou investigar o estado atual.");
    }
  });

  it("oculta mensagem plan_approved do chat mas ancora build run", () => {
    const messages: ChatMessage[] = [
      msg("u1", "user", "landing viva"),
      {
        id: "a-plan",
        role: "assistant",
        content: "Revise o plano.",
        timestamp: 0,
        runId: "run-plan",
        meta: { runId: "run-plan", planId: "p1", planStatus: "approved" },
      },
      {
        id: "u-approve",
        role: "user",
        content: "[Plano aprovado] Plano aprovado — executar em modo Build.",
        timestamp: 0,
        meta: { kind: "plan_approved", buildRunId: "run-build", planSourceRunId: "run-plan" },
      },
    ];
    const progress = { ...initialAgentProgress, statusHint: "Trabalhando…" };
    const thread = buildChatThread(messages, progress, {
      running: true,
      activeRunId: "run-build",
      sessionProgress: progress,
    });
    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant", "assistant"]);
    const users = thread.filter((t) => t.kind === "user");
    expect(users).toHaveLength(1);
    expect(users[0].kind === "user" && users[0].message.content).toBe("landing viva");
    const buildSlot = thread[2];
    expect(buildSlot.kind).toBe("assistant");
    if (buildSlot.kind === "assistant") {
      expect(buildSlot.runId).toBe("run-build");
      expect(buildSlot.isActive).toBe(true);
    }
  });

  it("pós-reload: cardSnapshot fraco + streamTail mantém evidência no turno", () => {
    const messages: ChatMessage[] = [
      msg("u1", "user", "cria landing"),
      {
        id: "a1",
        role: "assistant",
        content: "Landing criada.",
        timestamp: 0,
        runId: "run-reload",
        meta: {
          runId: "run-reload",
          partial: false,
          finishedAt: "2026-01-01T00:00:00Z",
          streamTail: [
            {
              type: "tool_start",
              data: { name: "fs_write", args: { path: "src/App.tsx" } },
              timestamp: 1,
            },
          ],
          cardSnapshot: { timeline: [], tools: [], finished: true, streamText: "Landing criada." },
        },
      },
    ];
    const thread = buildChatThread(messages, initialAgentProgress, {
      running: false,
      activeRunId: null,
      sessionProgress: initialAgentProgress,
    });
    const turn = thread[1];
    expect(turn.kind).toBe("assistant");
    if (turn.kind === "assistant") {
      expect(turn.miniCard).toBeTruthy();
      expect(turn.runId).toBe("run-reload");
    }
  });

  it("não vaza run de outra conversa em chat vazio", () => {
    const stale = {
      ...initialAgentProgress,
      finished: true,
      awaiting: true,
      awaitingKind: "plan_approval" as const,
      streamText: "## Plano errado",
    };
    const thread = buildChatThread([], stale, {
      running: false,
      activeRunId: "old-run",
      sessionProgress: stale,
    });
    expect(thread).toHaveLength(0);
  });
});