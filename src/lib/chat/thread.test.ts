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
    const progress = { ...initialAgentProgress, phase: "classify", statusHint: "Iniciando…" };
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