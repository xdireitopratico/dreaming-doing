import { describe, expect, it } from "vitest";
import { computeSmoothScrollStep, shouldShowNewMessagesPill } from "./chat-scroll-engine";

describe("shouldShowNewMessagesPill", () => {
  it("usa distância em pixels para decidir visibilidade", () => {
    expect(
      shouldShowNewMessagesPill({
        mode: "follow-bottom",
        bottomGapPx: 900,
        thresholdPx: 500,
      }),
    ).toBe(false);

    expect(
      shouldShowNewMessagesPill({
        mode: "manual",
        bottomGapPx: 420,
        thresholdPx: 500,
      }),
    ).toBe(false);

    expect(
      shouldShowNewMessagesPill({
        mode: "manual",
        bottomGapPx: 500,
        thresholdPx: 500,
      }),
    ).toBe(true);
  });
});

describe("computeSmoothScrollStep", () => {
  it("anda devagar perto do alvo e acelera quando a distância é grande", () => {
    expect(computeSmoothScrollStep(0, 20, 8, 96)).toBe(8);
    expect(computeSmoothScrollStep(0, 800, 8, 96)).toBe(96);
    expect(computeSmoothScrollStep(0, 120, 8, 96)).toBeCloseTo(14.4, 5);
  });
});
