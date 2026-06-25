import { describe, expect, it } from "vitest";
import { buildWireframeDiagramModel } from "@/lib/chat/wireframe-diagram";

describe("buildWireframeDiagramModel", () => {
  it("detects boxes, lines and labels from ascii wireframes", () => {
    const model = buildWireframeDiagramModel(
      [
        "+----------------------+",
        "| Header               |",
        "+----------+-----------+",
        "| Left     | Right     |",
        "+----------+-----------+",
      ].join("\n"),
    );

    expect(model.hasVisualFrame).toBe(true);
    expect(model.rects.length).toBeGreaterThan(0);
    expect(model.segments.length).toBeGreaterThan(0);
    expect(model.labels.some((label) => label.text.includes("Header"))).toBe(true);
    expect(model.labels.some((label) => label.text.includes("Left"))).toBe(true);
  });

  it("falls back cleanly when there is no line structure", () => {
    const model = buildWireframeDiagramModel("Hero\nCTA\nCards");

    expect(model.hasVisualFrame).toBe(false);
    expect(model.rects).toHaveLength(0);
    expect(model.segments).toHaveLength(0);
    expect(model.labels).toHaveLength(3);
  });
});
