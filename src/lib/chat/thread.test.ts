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

  it("autoResuming sozinho não mantém slot ativo sem running", () => {
    const messages = [msg("u1", "user", "fix build")];
    const progress = {
      ...initialAgentProgress,
      autoResuming: true,
      finished: false,
      statusHint: "Retomando automaticamente no servidor…",
    };
    const thread = buildChatThread(messages, progress, {
      running: false,
      activeRunId: "run-chunk",
      sessionProgress: progress,
    });
    const slot = thread[1];
    expect(slot?.kind).toBe("assistant");
    if (slot?.kind === "assistant") {
      expect(slot.isActive).toBe(false);
      expect(slot.runId).toBe("run-chunk");
    }
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
    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant", "plan_status", "assistant"]);
    const users = thread.filter((t) => t.kind === "user");
    expect(users).toHaveLength(1);
    expect(users[0].kind === "user" && users[0].message.content).toBe("landing viva");
    const planStatusSlot = thread[2];
    expect(planStatusSlot.kind).toBe("plan_status");
    if (planStatusSlot.kind === "plan_status") {
      expect(planStatusSlot.status).toBe("approved");
    }
    const buildSlot = thread[3];
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

  it("reordena narração órfã Entendi para depois do último user", () => {
    const messages: ChatMessage[] = [
      {
        id: "a-orphan",
        role: "assistant",
        content: "",
        timestamp: 0,
        parts: [{ type: "text", text: "Entendi: vou ler o projeto." }],
      },
      msg("u1", "user", "refaz o header"),
    ];
    const thread = buildChatThread(messages, initialAgentProgress, {
      sessionProgress: initialAgentProgress,
    });
    expect(thread.map((t) => t.kind)).toEqual(["user", "assistant"]);
  });

  it("slot live nunca ancora antes do último user visível", () => {
    const messages = [
      msg("u0", "user", "pedido antigo"),
      {
        id: "a0",
        role: "assistant" as const,
        content: "ok",
        timestamp: 0,
        runId: "run-old",
        meta: { runId: "run-old", finishedAt: "2026-01-01T00:00:00Z" },
      },
      msg("u1", "user", "novo pedido"),
    ];
    const progress = {
      ...initialAgentProgress,
      finished: false,
      narrationText: "Vou implementar.",
    };
    const thread = buildChatThread(messages, progress, {
      running: true,
      activeRunId: "run-new",
      sessionProgress: progress,
    });
    const userIdx = thread.findIndex((t) => t.kind === "user" && t.message.content === "novo pedido");
    const asstIdx = thread.findIndex((t) => t.kind === "assistant" && t.runId === "run-new");
    expect(userIdx).toBeGreaterThanOrEqual(0);
    expect(asstIdx).toBeGreaterThan(userIdx);
  });

  it("focusedRunId histórico suprime overlay live do activeRunId", () => {
    const messages = [
      msg("u1", "user", "old"),
      {
        id: "a-old",
        role: "assistant" as const,
        content: "done",
        timestamp: 1,
        runId: "run-old",
      },
      msg("u2", "user", "new"),
    ];
    const progress = {
      ...initialAgentProgress,
      finished: false,
      streamText: "Trabalhando no novo…",
    };
    const thread = buildChatThread(messages, progress, {
      running: true,
      activeRunId: "run-new",
      focusedRunId: "run-old",
      sessionProgress: progress,
    });
    const liveSlots = thread.filter(
      (t) => t.kind === "assistant" && t.isActive && t.runId === "run-new",
    );
    expect(liveSlots).toHaveLength(0);
    const focused = thread.find(
      (t) => t.kind === "assistant" && t.runId === "run-old" && t.isFocused,
    );
    expect(focused).toBeDefined();
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