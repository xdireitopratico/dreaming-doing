import { describe, it, expect, vi } from "vitest";
import {
  guessSectionTypeHeuristic,
  heuristicQualification,
  qualifyCaptureWithLlm,
} from "./capture-qualify";

const tinyPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("guessSectionTypeHeuristic", () => {
  it("marks first fold as hero", () => {
    expect(guessSectionTypeHeuristic(0, 0)).toBe("hero");
  });
});

describe("heuristicQualification", () => {
  it("always worthKeeping with label", () => {
    const q = heuristicQualification({
      pageUrl: "https://example.com",
      pngBase64: tinyPng,
      segmentIndex: 0,
      categories: ["hero"],
    });
    expect(q.worthKeeping).toBe(true);
    expect(q.label.length).toBeGreaterThan(0);
    expect(q.sectionType).toBe("hero");
  });
});

describe("qualifyCaptureWithLlm", () => {
  it("parses LLM JSON qualification", async () => {
    const mockLlm = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        worthKeeping: true,
        label: "Hero com grid animado",
        sectionType: "hero",
        confidence: 0.92,
        notes: "CTA visível",
      }),
    });

    const result = await qualifyCaptureWithLlm(mockLlm, {
      pageUrl: "https://livekit.com",
      pngBase64: tinyPng,
      segmentIndex: 0,
      categories: ["hero", "motion"],
    });

    expect(result.worthKeeping).toBe(true);
    expect(result.label).toContain("grid");
    expect(result.confidence).toBeCloseTo(0.92);
  });

  it("honors worthKeeping=false from LLM", async () => {
    const mockLlm = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        worthKeeping: false,
        label: "blank",
        sectionType: "unknown",
        confidence: 0.1,
      }),
    });

    const result = await qualifyCaptureWithLlm(mockLlm, {
      pageUrl: "https://example.com",
      pngBase64: tinyPng,
      categories: ["hero"],
    });

    expect(result.worthKeeping).toBe(false);
  });

  it("falls back to heuristic on parse failure", async () => {
    const mockLlm = vi.fn().mockResolvedValue({ content: "not json" });
    const result = await qualifyCaptureWithLlm(mockLlm, {
      pageUrl: "https://example.com",
      pngBase64: tinyPng,
      categories: ["hero"],
    });
    expect(result.worthKeeping).toBe(true);
    expect(result.notes).toContain("heuristic");
  });
});