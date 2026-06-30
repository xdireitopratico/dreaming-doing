import { describe, expect, it } from "vitest";
import { buildForgeTimeline } from "@/lib/timeline-builder";

function getThought(events: Parameters<typeof buildForgeTimeline>[0]) {
  const items = buildForgeTimeline(events);
  const thought = items.find((item) => item.type === "THOUGHT");
  if (!thought || thought.type !== "THOUGHT") {
    throw new Error("Expected one thought item");
  }
  return thought;
}

describe("buildForgeTimeline thinking", () => {
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

    expect(thought.text).toBe("Vou verificar o container.");
  });

  it("ignores assistant_text thinking without thinking_text legacy fallback", () => {
    const items = buildForgeTimeline([
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

    expect(items.some((item) => item.type === "THOUGHT")).toBe(false);
  });
});

describe("buildForgeTimeline tool_done", () => {
  it("fecha a última tool aberta no tool_done", () => {
    const items = buildForgeTimeline(
      [
        { type: "tool_start", data: { name: "fs_read", args: { path: "src/App.tsx" } }, timestamp: 1 },
        { type: "tool_done", data: { name: "fs_read", ok: true }, timestamp: 2 },
      ],
      false,
    );
    const read = items.find((i) => i.type === "READ");
    expect(read?.active).toBe(false);
    expect(read?.ok).toBe(true);
  });
});

describe("buildForgeTimeline hygiene", () => {
  it("remove lixo interno e preserva apenas eventos canônicos", () => {
    const items = buildForgeTimeline([
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
      {
        type: "skills",
        data: { active: ["design-system"], user: ["design-system"], invoked: ["design-system"] },
        timestamp: 8,
      },
    ]);

    const labels = items
      .map((item) => {
        if ("text" in item) return item.text;
        if ("name" in item) return item.name;
        if ("label" in item) return item.label;
        if ("title" in item) return item.title;
        if ("command" in item) return item.command;
        return "";
      })
      .join(" ");
    expect(labels).not.toMatch(
      /classif|State|Estado|Skills:|passo 3|parte 1\/12|0 file/i,
    );
  });

  it("renderiza plan_proposed como bloco próprio e não duplica closure adjacente", () => {
    const items = buildForgeTimeline([
      {
        type: "plan_proposed",
        data: {
          planId: "plan-1",
          summary: "Extração e mapeamento do Design System",
          mission: "Extração e mapeamento do Design System",
          runId: "run-1",
          projectId: "proj-1",
          steps: [
            { id: "s1", description: "Capturar HTML", type: "read", enabled: true },
            { id: "s2", description: "Mapear componentes", type: "read", enabled: true },
          ],
        },
        timestamp: 1,
      },
      { type: "done", data: { summary: "Extração e mapeamento do Design System", ok: true }, timestamp: 2 },
      { type: "done", data: { summary: "Extração e mapeamento do Design System", ok: true }, timestamp: 3 },
    ]);

    expect(items.filter((item) => item.type === "PLAN")).toHaveLength(1);
    expect(items.filter((item) => item.type === "CLOSURE")).toHaveLength(1);
  });
});
