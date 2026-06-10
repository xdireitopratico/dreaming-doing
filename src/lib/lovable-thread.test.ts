import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import { initialAgentProgress } from "@/lib/agent-progress";
import { buildLovableThread, freezeSnapshot, resolveAssistantProgress } from "@/lib/lovable-thread";

function msg(id: string, role: ChatMessage["role"], content: string): ChatMessage {
  return { id, role, content, timestamp: 0 };
}

describe("buildLovableThread", () => {
  it("pares user/assistant em ordem", () => {
    const messages = [
      msg("u1", "user", "oi"),
      msg("a1", "assistant", "olá"),
      msg("u2", "user", "mais"),
      msg("a2", "assistant", "ok"),
    ];
    const thread = buildLovableThread(messages, initialAgentProgress, {});
    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("live após último user sem resposta", () => {
    const messages = [msg("u1", "user", "build"), msg("u2", "user", "mais uma")];
    const progress = { ...initialAgentProgress, phase: "execute", message: "Gerando…" };
    const thread = buildLovableThread(messages, progress, {
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

  it("live no turno pendente com histórico anterior", () => {
    const messages = [
      msg("u1", "user", "a"),
      msg("a1", "assistant", "ok"),
      msg("u2", "user", "b"),
    ];
    const thread = buildLovableThread(messages, initialAgentProgress, {
      running: true,
      activeRunId: "run-2",
    });
    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(thread[3]).toMatchObject({ isActive: true, runId: "run-2" });
  });

  it("frozen após run sem assistant no DB", () => {
    const messages = [msg("u1", "user", "x")];
    const frozen = new Map([
      [
        "r1",
        freezeSnapshot({
          ...initialAgentProgress,
          finished: true,
          error: "falhou",
          streamText: "parcial",
        }),
      ],
    ]);
    const thread = buildLovableThread(messages, initialAgentProgress, {
      running: false,
      activeRunId: "r1",
      frozenRuns: frozen,
    });
    expect(thread).toHaveLength(2);
    const slot = thread[1] as Extract<(typeof thread)[number], { kind: "assistant" }>;
    expect(slot.frozen?.error).toBe("falhou");
    expect(slot.isActive).toBe(false);
  });

  it("progress live reflete mensagem atualizada do agente", () => {
    const messages = [msg("u1", "user", "x")];
    const p2 = { ...initialAgentProgress, message: "Editando App.tsx…" };
    const t2 = buildLovableThread(messages, p2, { running: true, activeRunId: "r1" });
    expect(t2).toHaveLength(2);
    expect((t2[1] as { live?: { message: string | null } }).live?.message).toBe(
      "Editando App.tsx…",
    );
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
    const thread = buildLovableThread(messages, progress, {
      running: true,
      activeRunId: "build-run",
    });
    expect(thread.map((t) => t.kind)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(thread[3]).toMatchObject({
      kind: "assistant",
      isActive: true,
      runId: "build-run",
    });
  });

  it("frozen preserva currentStep e deliveryFiles no resolve", () => {
    const frozen = freezeSnapshot({
      ...initialAgentProgress,
      finished: true,
      currentStep: 5,
      totalSteps: 10,
      deliveryFiles: ["app/build.gradle.kts"],
      streamText: "Chunk entregue",
    });
    const resolved = resolveAssistantProgress({
      kind: "assistant",
      frozen,
      isActive: false,
    });
    expect(resolved?.currentStep).toBe(5);
    expect(resolved?.totalSteps).toBe(10);
    expect(resolved?.deliveryFiles).toEqual(["app/build.gradle.kts"]);
  });

  it("merge assistants consecutivos com mesmo runId", () => {
    const messages: ChatMessage[] = [
      msg("u1", "user", "build app"),
      { ...msg("a1", "assistant", "Passo 1"), runId: "run-x" },
      { ...msg("a2", "assistant", "Passo 2"), runId: "run-x" },
      { ...msg("a3", "assistant", "Pronto!"), runId: "run-x" },
    ];
    const thread = buildLovableThread(messages, initialAgentProgress, {});
    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant"]);
    const slot = thread[1] as Extract<(typeof thread)[number], { kind: "assistant" }>;
    expect(slot.runId).toBe("run-x");
    expect(slot.message?.content).toContain("Passo 1");
    expect(slot.message?.content).toContain("Pronto!");
  });

  it("colapsa múltiplos assistants do mesmo runId com slot live", () => {
    const messages: ChatMessage[] = [
      msg("u1", "user", "build padaria"),
      { ...msg("a1", "assistant", "Passo 1"), runId: "run-x", meta: { runId: "run-x" } },
      { ...msg("a2", "assistant", "Passo 2"), runId: "run-x", meta: { runId: "run-x" } },
      { ...msg("a3", "assistant", "Passo 3"), runId: "run-x", meta: { runId: "run-x" } },
    ];
    const progress = { ...initialAgentProgress, phase: "execute", message: "Trabalhando…" };
    const thread = buildLovableThread(messages, progress, {
      running: true,
      activeRunId: "run-x",
    });
    const assistants = thread.filter((t) => t.kind === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]).toMatchObject({ isActive: true, runId: "run-x" });
  });

  it("mini-card persiste: frozen histórico em turnos anteriores enquanto novo run ativo", () => {
    const messages: ChatMessage[] = [
      msg("u1", "user", "padaria"),
      {
        ...msg("a1", "assistant", "Entrega 1"),
        runId: "run-1",
        meta: { runId: "run-1", finishedAt: "2026-01-01T00:00:00Z" },
      },
      msg("u2", "user", "adicione footer"),
    ];
    const frozen = new Map([
      [
        "run-1",
        freezeSnapshot({
          ...initialAgentProgress,
          finished: true,
          lastFinishOk: true,
          deliveryFiles: ["src/App.tsx"],
        }),
      ],
    ]);
    const progress = { ...initialAgentProgress, phase: "execute", message: "Trabalhando…" };
    const thread = buildLovableThread(messages, progress, {
      running: true,
      activeRunId: "run-2",
      frozenRuns: frozen,
    });
    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant", "user", "assistant"]);
    const first = thread[1] as Extract<(typeof thread)[number], { kind: "assistant" }>;
    const second = thread[3] as Extract<(typeof thread)[number], { kind: "assistant" }>;
    expect(first.runId).toBe("run-1");
    expect(first.frozen?.deliveryFiles).toEqual(["src/App.tsx"]);
    expect(resolveAssistantProgress(first)?.finished).toBe(true);
    expect(second.isActive).toBe(true);
    expect(second.runId).toBe("run-2");
  });

  it("resolve progresso do DB quando não há frozen", () => {
    const slot = {
      kind: "assistant" as const,
      isActive: false,
      runId: "run-z",
      message: {
        id: "a1",
        role: "assistant" as const,
        content: "Feito.",
        timestamp: 0,
        meta: { runId: "run-z", finishedAt: "2026-01-01T00:00:00Z" },
      },
    };
    const resolved = resolveAssistantProgress(slot);
    expect(resolved?.finished).toBe(true);
    expect(resolved?.summary).toBe("Feito.");
  });

  it("frozen persiste sem activeRunId e sem msg DB (append-only)", () => {
    const messages = [msg("u1", "user", "padaria")];
    const frozen = new Map([
      [
        "run-gone",
        freezeSnapshot({
          ...initialAgentProgress,
          finished: true,
          lastFinishOk: true,
          timeline: [
            { type: "tool_start", data: { name: "fs_read" }, timestamp: 1 },
          ],
        }),
      ],
    ]);
    const thread = buildLovableThread(messages, initialAgentProgress, {
      running: false,
      activeRunId: null,
      frozenRuns: frozen,
    });
    expect(thread).toHaveLength(2);
    const slot = thread[1] as Extract<(typeof thread)[number], { kind: "assistant" }>;
    expect(slot.runId).toBe("run-gone");
    expect(slot.frozen?.finished).toBe(true);
    expect(resolveAssistantProgress(slot)?.timeline.length).toBeGreaterThan(0);
  });

  it("concierge sem runId: resposta live aparece no turno pendente", () => {
    const messages = [msg("u1", "user", "quero uma landing de cafeteria")];
    const progress = {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: true,
      streamText: "Ótimo! Me conta o estilo visual que você imagina.",
    };
    const thread = buildLovableThread(messages, progress, {});
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
    const thread = buildLovableThread(messages, progress, {
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
    const thread = buildLovableThread(messages, progress, {});
    expect(thread).toHaveLength(2);
    const slot = thread[1] as Extract<(typeof thread)[number], { kind: "assistant" }>;
    expect(slot.live?.error).toBe("Chave API inválida");
  });
});