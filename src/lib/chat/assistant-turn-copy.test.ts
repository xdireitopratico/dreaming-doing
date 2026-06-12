import { describe, expect, it } from "vitest";
import { assistantTurnCopyText } from "@/lib/chat/assistant-turn-copy";
import type { ThreadItem } from "@/lib/chat/types";

function assistant(
  overrides: Partial<Extract<ThreadItem, { kind: "assistant" }>>,
): Extract<ThreadItem, { kind: "assistant" }> {
  return {
    kind: "assistant",
    runId: "run-1",
    isActive: false,
    streamText: null,
    ...overrides,
  };
}

describe("assistantTurnCopyText", () => {
  it("concatena narração e fechamento", () => {
    const text = assistantTurnCopyText(
      assistant({
        narration: "Vou começar pelo header.",
        streamText: "Pronto — header no lugar.",
      }),
    );
    expect(text).toContain("Vou começar pelo header.");
    expect(text).toContain("Pronto — header no lugar.");
  });

  it("usa message.content como fallback", () => {
    const text = assistantTurnCopyText(
      assistant({
        message: { id: "a1", role: "assistant", content: "Resposta salva.", timestamp: 0 },
      }),
    );
    expect(text).toBe("Resposta salva.");
  });
});