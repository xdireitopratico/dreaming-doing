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

describe("buildTimeline hygiene", () => {
  it("remove lixo interno e preserva Robin/skill explícito", () => {
    const items = buildTimeline([
      { type: "classify", data: { model: "nemotron" }, timestamp: 1 },
      { type: "fsm_transition", data: { to: "planning" }, timestamp: 2 },
      {
        type: "skills",
        data: { active: ["react-tailwind"], stack: ["react-tailwind"] },
        timestamp: 3,
      },
      {
        type: "phase",
        data: { phase: "checkpoint", message: "Continuando do passo 3 de 70." },
        timestamp: 4,
      },
      { type: "explore", data: { message: "Continuando (parte 1/12)…" }, timestamp: 5 },
      { type: "delivery_checkpoint", data: { files: [] }, timestamp: 6 },
      { type: "robin_rotate", data: {}, timestamp: 7 },
      {
        type: "skills",
        data: { active: ["design-system"], user: ["design-system"], invoked: ["design-system"] },
        timestamp: 8,
      },
    ]);

    const labels = items.map((item) => item.label);
    expect(labels.join(" ")).not.toMatch(
      /classif|State|Estado|Skills:|passo 3|parte 1\/12|0 file/i,
    );
    expect(labels).toContain("Robin rotating API key");
    expect(labels).toContain("Skill: design-system");
  });
});
