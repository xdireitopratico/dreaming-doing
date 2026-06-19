import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/lib/timeline-builder";

function getThought(events: Parameters<typeof buildTimeline>[0]) {
  const items = buildTimeline(events);
  const thought = items.find((item) => item.kind === "thought");
  if (!thought || thought.kind !== "thought") {
    throw new Error("Expected one thought item");
  }
  return thought;
}

describe("buildTimeline thinking", () => {
  it("uses thinking_text as source of truth when assistant_text thinking duplicates it", () => {
    const thought = getThought([
      {
        type: "assistant_text",
        data: { text: "Vou", thinking: true, delta: true },
        timestamp: 1,
      },
      {
        type: "thinking_text",
        data: { text: "Vou", delta: true },
        timestamp: 1,
      },
      {
        type: "thinking_text",
        data: { text: " verificar o container.", delta: true },
        timestamp: 2,
      },
    ]);

    expect(thought.detail).toBe("Vou verificar o container.");
  });

  it("falls back to assistant_text thinking when thinking_text is absent", () => {
    const thought = getThought([
      {
        type: "assistant_text",
        data: { text: "Vou", thinking: true, delta: true },
        timestamp: 1,
      },
      {
        type: "assistant_text",
        data: { text: " verificar o container.", thinking: true, delta: true },
        timestamp: 2,
      },
    ]);

    expect(thought.detail).toBe("Vou verificar o container.");
  });
});
