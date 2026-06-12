import { describe, expect, it } from "vitest";
import {
  computeUserAnchorSpacerHeight,
  shouldAnchorNewUserMessage,
  shouldHoldUserMessageAnchor,
} from "@/lib/chat/user-message-anchor";

describe("shouldAnchorNewUserMessage", () => {
  it("não ancora antes do scroll inicial", () => {
    expect(shouldAnchorNewUserMessage(null, "u-2", false)).toBe(false);
  });

  it("ancora só quando o id do usuário mudou após o load", () => {
    expect(shouldAnchorNewUserMessage("u-1", "u-2", true)).toBe(true);
    expect(shouldAnchorNewUserMessage("u-2", "u-2", true)).toBe(false);
  });
});

describe("computeUserAnchorSpacerHeight", () => {
  it("preenche o restante do viewport abaixo da bolha", () => {
    expect(computeUserAnchorSpacerHeight(600, 80, 16, 8, 8)).toBe(488);
  });

  it("não retorna negativo", () => {
    expect(computeUserAnchorSpacerHeight(200, 400, 16, 8, 8)).toBe(0);
  });
});

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