import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import { initialAgentProgress } from "@/lib/agent-progress";
import {
  buildForgeChatThread,
  resolveForgeAssistantProgress,
} from "@/lib/forge-chat/build-thread";
import { PENDING_RUN_ID } from "@/lib/forge-chat/types";

function msg(id: string, role: ChatMessage["role"], content: string): ChatMessage {
  return { id, role, content, timestamp: 0 };
}

describe("buildForgeChatThread", () => {
  it("ordem cronológica estrita do DB", () => {
    const messages = [
      msg("u1", "user", "oi"),
      msg("a1", "assistant", "olá"),
      msg("u2", "user", "mais"),
      msg("a2", "assistant", "ok"),
    ];
    const thread = buildForgeChatThread(messages, initialAgentProgress, {});
    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("slot __pending__ imediato", () => {
    const messages = [msg("u1", "user", "bom dia")];
    const progress = { ...initialAgentProgress, phase: "classify", statusHint: "Iniciando…" };
    const thread = buildForgeChatThread(messages, progress, {
      running: true,
      activeRunId: PENDING_RUN_ID,
    });
    expect(thread).toHaveLength(2);
    const slot = thread[1] as Extract<(typeof thread)[number], { kind: "assistant" }>;
    expect(slot.runId).toBe(PENDING_RUN_ID);
    expect(slot.isActive).toBe(true);
  });

  it("não vaza run de outra conversa em chat vazio", () => {
    const stale = {
      ...initialAgentProgress,
      finished: true,
      awaiting: true,
      awaitingKind: "plan_approval" as const,
      streamText: "## Plano errado",
    };
    const thread = buildForgeChatThread([], stale, {
      running: false,
      activeRunId: "old-run",
    });
    expect(thread).toHaveLength(0);
  });

  it("DB materializado vence live no resolve", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "Feito.",
      timestamp: 0,
      meta: {
        runId: "run-z",
        finishedAt: "2026-01-01T00:00:00Z",
        cardSnapshot: {
          streamText: "Do banco.",
          finished: true,
          lastFinishOk: true,
          deliveryFiles: ["src/App.tsx"],
          timeline: [],
          tools: [],
          diffs: [],
          phase: "done",
        },
      },
    };
    const resolved = resolveForgeAssistantProgress({
      kind: "assistant",
      isActive: false,
      runId: "run-z",
      message,
      live: {
        ...initialAgentProgress,
        streamText: "stale live",
        finished: true,
      },
    });
    expect(resolved?.streamText).toBe("Do banco.");
  });
});