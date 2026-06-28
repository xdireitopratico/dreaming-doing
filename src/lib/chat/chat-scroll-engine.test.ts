import { describe, expect, it } from "vitest";
import { shouldShowNewMessagesPill } from "./chat-scroll-engine";

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
