import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/components/editor/ChatInput";
import { initialAgentProgress } from "@/lib/agent-progress";
import { buildLovableThread } from "@/lib/lovable-thread";

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

  it("anexa bloco live após histórico quando running", () => {
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

  it("progress live reflete mensagem atualizada do agente", () => {
    const messages = [msg("u1", "user", "x")];
    const p2 = { ...initialAgentProgress, message: "Editando App.tsx…" };
    const t2 = buildLovableThread(messages, p2, { running: true, activeRunId: "r1" });
    expect(t2).toHaveLength(2);
    expect((t2[1] as { live?: { message: string | null } }).live?.message).toBe(
      "Editando App.tsx…",
    );
  });

  it("não coloca timeline global — só no assistant live", () => {
    const messages = [msg("u1", "user", "x")];
    const progress = {
      ...initialAgentProgress,
      timeline: [{ type: "phase", data: { phase: "plan" }, timestamp: 1 }],
    };
    const thread = buildLovableThread(messages, progress, {
      running: true,
      activeRunId: "r1",
    });
    const live = thread[1] as Extract<(typeof thread)[number], { kind: "assistant" }>;
    expect(live.live?.timeline).toHaveLength(1);
  });
});