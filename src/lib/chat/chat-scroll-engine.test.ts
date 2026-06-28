import { describe, expect, it } from "vitest";
import { shouldShowNewMessagesPill } from "./chat-scroll-engine";

describe("shouldShowNewMessagesPill", () => {
  it("usa distância em pixels para decidir visibilidade", () => {
    const baseline = "assistant:run-1:live:10:0:none:0:0:0";

    expect(
      shouldShowNewMessagesPill({
        mode: "manual",
        signature: baseline,
        signatureAtManual: baseline,
        bottomGapPx: 900,
        thresholdPx: 500,
      }),
    ).toBe(false);

    expect(
      shouldShowNewMessagesPill({
        mode: "manual",
        signature: "assistant:run-1:done:14:0:none:0:0:0",
        signatureAtManual: baseline,
        bottomGapPx: 420,
        thresholdPx: 500,
      }),
    ).toBe(false);

    expect(
      shouldShowNewMessagesPill({
        mode: "manual",
        signature: "assistant:run-1:done:14:0:none:0:0:0",
        signatureAtManual: baseline,
        bottomGapPx: 500,
        thresholdPx: 500,
      }),
    ).toBe(true);
  });
});
