import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/components/editor/ChatInput";
import { isAssistantRunMaterialized } from "@/lib/assistant-materialized";

function msg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    content: "",
    timestamp: 0,
    ...overrides,
  };
}

describe("isAssistantRunMaterialized", () => {
  it("rejeita mensagem vazia", () => {
    expect(isAssistantRunMaterialized(msg({ runId: "r1" }))).toBe(false);
  });

  it("aceita content preenchido", () => {
    expect(isAssistantRunMaterialized(msg({ runId: "r1", content: "Pronto." }))).toBe(true);
  });

  it("aceita meta com finishedAt como materializado", () => {
    expect(
      isAssistantRunMaterialized(
        msg({
          runId: "r1",
          content: "Build concluído.",
          meta: { runId: "r1", finishedAt: "2026-06-08T00:00:00Z" },
        }),
      ),
    ).toBe(true);
  });

  it("rejeita mensagem partial mesmo com texto", () => {
    expect(
      isAssistantRunMaterialized(
        msg({
          runId: "r1",
          content: "Chunk 1",
          meta: { partial: true, runId: "r1" },
        }),
      ),
    ).toBe(false);
  });
});