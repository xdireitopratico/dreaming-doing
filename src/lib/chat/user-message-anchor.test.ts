import { describe, expect, it } from "vitest";
import { shouldHoldUserMessageAnchor } from "@/lib/chat/user-message-anchor";

describe("shouldHoldUserMessageAnchor", () => {
  it("segura anchor no turno otimista __pending__", () => {
    expect(
      shouldHoldUserMessageAnchor({
        isPendingRun: true,
        running: false,
        activeRunId: "__pending__",
        finished: false,
      }),
    ).toBe(true);
  });

  it("segura anchor com run ativa", () => {
    expect(
      shouldHoldUserMessageAnchor({
        isPendingRun: false,
        running: true,
        activeRunId: "run-1",
        finished: false,
      }),
    ).toBe(true);
  });

  it("libera anchor após run terminal", () => {
    expect(
      shouldHoldUserMessageAnchor({
        isPendingRun: false,
        running: false,
        activeRunId: null,
        finished: true,
      }),
    ).toBe(false);
  });
});