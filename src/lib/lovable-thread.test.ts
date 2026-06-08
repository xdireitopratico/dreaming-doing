import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/components/editor/ChatInput";
import { initialAgentProgress } from "@/lib/agent-progress";
import { buildLovableThread, freezeSnapshot } from "@/lib/lovable-thread";

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
});