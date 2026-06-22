import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import {
  canReleaseLiveSlot,
  isAssistantRunMaterialized,
} from "@/lib/assistant-materialized";

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

  it("rejeita content sem finishedAt (passo intermediário)", () => {
    expect(isAssistantRunMaterialized(msg({ runId: "r1", content: "Passo 1" }))).toBe(false);
  });

  it("aceita content com finishedAt como materializado", () => {
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

  it("rejeita mensagem partial mesmo com texto e finishedAt ausente", () => {
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

  it("canReleaseLiveSlot segue isAssistantRunMaterialized", () => {
    const materialized = msg({
      runId: "r1",
      content: "Done.",
      meta: { runId: "r1", finishedAt: "2026-06-08T00:00:00Z" },
    });
    expect(canReleaseLiveSlot(materialized)).toBe(true);
    expect(canReleaseLiveSlot(msg({ runId: "r1", content: "wip" }))).toBe(false);
  });

  it("rejeita checkpoint entre chunks mesmo com finishedAt", () => {
    expect(
      isAssistantRunMaterialized(
        msg({
          runId: "r1",
          content: "Retomando…",
          meta: {
            runId: "r1",
            finishedAt: "2026-06-08T00:00:00Z",
            checkpoint: true,
            betweenChunks: true,
          },
        }),
      ),
    ).toBe(false);
  });

  it("rejeita partial com finishedAt se partial ainda true", () => {
    expect(
      isAssistantRunMaterialized(
        msg({
          runId: "r1",
          content: "Chunk",
          meta: { partial: true, finishedAt: "2026-06-08T00:00:00Z", runId: "r1" },
        }),
      ),
    ).toBe(false);
  });
});
