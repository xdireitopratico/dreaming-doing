import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import { initialAgentProgress } from "@/lib/agent-progress";
import { buildChatThread, PENDING_RUN_ID, resolveAssistantProgress } from "@/lib/chat-thread";

function msg(id: string, role: ChatMessage["role"], content: string): ChatMessage {
  return { id, role, content, timestamp: 0 };
}

describe("buildChatThread", () => {
  it("mensagem queued permanece no thread cronológico", () => {
    const messages: ChatMessage[] = [
      msg("u1", "user", "primeira"),
      { ...msg("a1", "assistant", "ok"), runId: "r1" },
      {
        id: "u2",
        role: "user",
        content: "na fila",
        timestamp: 0,
        meta: { queued: true },
      },
    ];
    const thread = buildChatThread(messages, initialAgentProgress, {});
    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant", "user"]);
    expect(thread[2]?.kind === "user" && thread[2].message.meta?.queued).toBe(true);
  });

  it("pares user/assistant em ordem", () => {
    const messages = [
      msg("u1", "user", "oi"),
      msg("a1", "assistant", "olá"),
      msg("u2", "user", "mais"),
      msg("a2", "assistant", "ok"),
    ];
    const thread = buildChatThread(messages, initialAgentProgress, {});
    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("slot pendente (__pending__) com Think imediato antes do runId real", () => {
    const messages = [msg("u1", "user", "bom dia")];
    const progress = { ...initialAgentProgress, phase: "classify", statusHint: "Iniciando…" };
    const thread = buildChatThread(messages, progress, {
      running: true,
      activeRunId: PENDING_RUN_ID,
    });
    expect(thread).toHaveLength(2);
    const slot = thread[1] as Extract<(typeof thread)[number], { kind: "assistant" }>;
    expect(slot.runId).toBe(PENDING_RUN_ID);
    expect(slot.isActive).toBe(true);
    expect(slot.live?.statusHint).toBe("Iniciando…");
  });

  it("pending vira runId real sem duplicar assistant", () => {
    const messages = [msg("u1", "user", "bom dia")];
    const progress = { ...initialAgentProgress, phase: "execute", message: "Trabalhando…" };
    const pendingThread = buildChatThread(messages, progress, {
      running: true,
      activeRunId: PENDING_RUN_ID,
    });
    const mergedThread = buildChatThread(messages, progress, {
      running: true,
      activeRunId: "run-real",
    });
    expect(pendingThread.filter((t) => t.kind === "assistant")).toHaveLength(1);
    expect(mergedThread.filter((t) => t.kind === "assistant")).toHaveLength(1);
    expect(
      (mergedThread[1] as Extract<(typeof mergedThread)[number], { kind: "assistant" }>).runId,
    ).toBe("run-real");
  });

  it("live após último user sem resposta", () => {
    const messages = [msg("u1", "user", "build"), msg("u2", "user", "mais uma")];
    const progress = { ...initialAgentProgress, phase: "execute", message: "Gerando…" };
    const thread = buildChatThread(messages, progress, {
      running: true,
      activeRunId: "run-1",
    });
    expect(thread).toHaveLength(3);
    expect(thread[2]).toMatchObject({
      kind: "assistant",
      isActive: true,
      runId: "run-1",
    });
  });

  it("não duplica assistant quando DB já materializou após terminal", () => {
    const messages: ChatMessage[] = [
      msg("u1", "user", "build"),
      {
        ...msg("a1", "assistant", "Pronto!"),
        runId: "run-done",
        meta: {
          runId: "run-done",
          finishedAt: "2026-01-01T00:00:00Z",
          cardSnapshot: {
            streamText: "Pronto!",
            finished: true,
            lastFinishOk: true,
            deliveryFiles: ["src/App.tsx"],
            timeline: [],
            tools: [],
            diffs: [],
            phase: "done",
          },
        },
      },
    ];
    const progress = {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: true,
      streamText: "Pronto!",
    };
    const thread = buildChatThread(messages, progress, {
      running: false,
      activeRunId: null,
    });
    expect(thread.filter((t) => t.kind === "assistant")).toHaveLength(1);
  });

  it("plan approve: live build após user com meta.buildRunId", () => {
    const messages: ChatMessage[] = [
      msg("u1", "user", "crie um app"),
      { ...msg("a1", "assistant", "## Plano"), runId: "plan-run" },
      {
        id: "u2",
        role: "user",
        content: "Plano aprovado — executar em modo Build.",
        timestamp: 0,
        meta: { kind: "plan_approved", buildRunId: "build-run", planId: "p1" },
      },
    ];
    const progress = { ...initialAgentProgress, phase: "execute", message: "Implementando…" };
    const thread = buildChatThread(messages, progress, {
      running: true,
      activeRunId: "build-run",
    });
    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(thread[3]).toMatchObject({
      kind: "assistant",
      isActive: true,
      runId: "build-run",
    });
  });

  it("merge assistants consecutivos com mesmo runId", () => {
    const messages: ChatMessage[] = [
      msg("u1", "user", "build app"),
      { ...msg("a1", "assistant", "Passo 1"), runId: "run-x" },
      { ...msg("a2", "assistant", "Passo 2"), runId: "run-x" },
      { ...msg("a3", "assistant", "Pronto!"), runId: "run-x" },
    ];
    const thread = buildChatThread(messages, initialAgentProgress, {});
    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant"]);
    const slot = thread[1] as Extract<(typeof thread)[number], { kind: "assistant" }>;
    expect(slot.runId).toBe("run-x");
    expect(slot.message?.content).toContain("Passo 1");
    expect(slot.message?.content).toContain("Pronto!");
  });

  it("concierge sem runId: resposta live aparece no turno pendente", () => {
    const messages = [msg("u1", "user", "quero uma landing de cafeteria")];
    const progress = {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: true,
      streamText: "Ótimo! Me conta o estilo visual que você imagina.",
    };
    const thread = buildChatThread(messages, progress, {});
    expect(thread).toHaveLength(2);
    const slot = thread[1] as Extract<(typeof thread)[number], { kind: "assistant" }>;
    expect(slot.live?.streamText).toContain("estilo visual");
    expect(resolveAssistantProgress(slot)?.streamText).toContain("estilo visual");
  });

  it("run finished não mantém isActive mesmo com running=true stale", () => {
    const messages = [msg("u1", "user", "build")];
    const progress = {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: true,
      streamText: "Pronto!",
    };
    const thread = buildChatThread(messages, progress, {
      running: true,
      activeRunId: "run-done",
    });
    const slot = thread[1] as Extract<(typeof thread)[number], { kind: "assistant" }>;
    expect(slot.isActive).toBe(false);
    expect(slot.live?.finished).toBe(true);
  });

  it("erro de connect sem runId aparece no turno pendente", () => {
    const messages = [msg("u1", "user", "build")];
    const progress = {
      ...initialAgentProgress,
      finished: true,
      error: "Chave API inválida",
    };
    const thread = buildChatThread(messages, progress, {});
    expect(thread).toHaveLength(2);
    const slot = thread[1] as Extract<(typeof thread)[number], { kind: "assistant" }>;
    expect(slot.live?.error).toBe("Chave API inválida");
  });

  it("não injeta overlay de run/plano de outra conversa em chat vazio", () => {
    const staleProgress = {
      ...initialAgentProgress,
      finished: true,
      awaiting: true,
      awaitingKind: "plan_approval" as const,
      streamText: "## Plano errado",
      pendingPlan: {
        planId: "stale",
        summary: "Plano antigo",
        steps: [{ id: "s1", type: "custom" as const, description: "x", enabled: true }],
        ttlMs: 60_000,
        proposedAt: Date.now(),
        runId: "old-run",
        projectId: "p1",
      },
    };
    const thread = buildChatThread([], staleProgress, {
      running: false,
      activeRunId: "old-run",
    });
    expect(thread).toHaveLength(0);
  });

  it("DB materializado vence live stale no resolve", () => {
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
    const resolved = resolveAssistantProgress({
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
