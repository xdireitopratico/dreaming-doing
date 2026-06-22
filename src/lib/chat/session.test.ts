import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import { initialAgentProgress } from "@/lib/agent-progress";
import { scopeLiveState } from "@/lib/chat/session";

function msg(id: string, role: ChatMessage["role"], content: string, runId?: string): ChatMessage {
  return {
    id,
    role,
    content,
    timestamp: 0,
    runId,
    meta: runId ? { runId } : undefined,
  };
}

describe("scopeLiveState", () => {
  it("não injeta overlay efêmero sem activeRunId", () => {
    const progress = {
      ...initialAgentProgress,
      finished: true,
      streamText: "Resposta antiga do snapshot",
      lastFinishOk: true,
    };
    const messages = [msg("u1", "user", "oi")];

    expect(scopeLiveState(messages, progress, null, false)).toBeNull();
  });

  it("não vaza run de outra conversa em chat vazio", () => {
    const progress = {
      ...initialAgentProgress,
      finished: true,
      streamText: "## Plano errado",
    };

    expect(scopeLiveState([], progress, "old-run", false)).toBeNull();
  });

  it("mantém overlay após finish até materializar no DB", () => {
    const progress = {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: true,
      streamText: "Pronto!",
      workingDurationMs: 3200,
    };
    const messages = [msg("u1", "user", "oi")];

    expect(scopeLiveState(messages, progress, "run-1", false)).toEqual({
      activeRunId: "run-1",
      progress,
      running: false,
    });
  });

  it("permite slot pendente imediato após envio", () => {
    const progress = { ...initialAgentProgress, statusHint: "Iniciando…" };

    expect(scopeLiveState([], progress, "__pending__", true)).toEqual({
      activeRunId: "__pending__",
      progress,
      running: true,
    });
  });
});