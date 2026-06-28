import { describe, expect, it } from "vitest";
import { shouldShowNewMessagesPill } from "./chat-scroll-engine";

describe("shouldShowNewMessagesPill", () => {
  it("exige pelo menos duas mensagens novas para aparecer", () => {
    const manual = "assistant:run-1:live:10:0:none:0:0:0";

    expect(
      shouldShowNewMessagesPill({
        mode: "manual",
        signature: manual,
        signatureAtManual: manual,
        threadLength: 12,
        manualThreadLength: 12,
      }),
    ).toBe(false);

    expect(
      shouldShowNewMessagesPill({
        mode: "manual",
        signature: "assistant:run-1:done:14:0:none:0:0:0",
        signatureAtManual: manual,
        threadLength: 13,
        manualThreadLength: 12,
      }),
    ).toBe(false);

    expect(
      shouldShowNewMessagesPill({
        mode: "manual",
        signature: "assistant:run-1:done:14:0:none:0:0:0",
        signatureAtManual: manual,
        threadLength: 14,
        manualThreadLength: 12,
      }),
    ).toBe(true);
  });
});
