import { describe, expect, it } from "vitest";
import type { ThreadItem } from "@/lib/chat/types";
import {
  buildThreadScrollSignature,
  clampScrollTop,
  computeBottomTarget,
  computeSmoothScrollStep,
  isNearBottom,
  shouldShowNewMessagesPill,
} from "@/lib/chat/chat-scroll-engine";

describe("clampScrollTop", () => {
  it("limita entre 0 e scrollHeight - clientHeight", () => {
    expect(clampScrollTop(-10, 1000, 400)).toBe(0);
    expect(clampScrollTop(900, 1000, 400)).toBe(600);
    expect(clampScrollTop(300, 1000, 400)).toBe(300);
  });
});

describe("computeBottomTarget", () => {
  it("retorna o fim do container", () => {
    expect(computeBottomTarget(1200, 500)).toBe(700);
  });
});

describe("computeSmoothScrollStep", () => {
  it("aproxima no máximo maxStepPx por passo", () => {
    expect(computeSmoothScrollStep(0, 100, 8)).toBe(8);
    expect(computeSmoothScrollStep(100, 0, 8)).toBe(92);
  });

  it("encaixa no alvo quando a distância é menor que meio pixel", () => {
    expect(computeSmoothScrollStep(10, 10.3, 8)).toBe(10.3);
  });
});

describe("isNearBottom", () => {
  it("detecta proximidade do fim", () => {
    expect(isNearBottom(890, 1000, 100, 100)).toBe(true);
    expect(isNearBottom(799, 1000, 100, 100)).toBe(false);
  });
});

describe("shouldShowNewMessagesPill", () => {
  it("só aparece em manual com assinatura nova", () => {
    expect(
      shouldShowNewMessagesPill({
        mode: "manual",
        signature: "assistant:run:live:10:0:active:0:0:0",
        signatureAtManual: "assistant:run:live:5:0:active:0:0:0",
      }),
    ).toBe(true);
    expect(
      shouldShowNewMessagesPill({
        mode: "follow-bottom",
        signature: "a",
        signatureAtManual: "b",
      }),
    ).toBe(false);
  });
});

describe("buildThreadScrollSignature", () => {
  it("muda quando o stream do turno ativo cresce", () => {
    const base: ThreadItem = {
      kind: "assistant",
      runId: "run-1",
      isActive: true,
      streamText: "oi",
      thinking: { status: "active" },
    };
    const sig1 = buildThreadScrollSignature([base]);
    const sig2 = buildThreadScrollSignature([
      { ...base, streamText: "oi mundo" },
    ]);
    expect(sig1).not.toBe(sig2);
  });

  it("muda quando mini-card aparece", () => {
    const base: ThreadItem = {
      kind: "assistant",
      runId: "run-1",
      isActive: true,
      streamText: null,
    };
    const sig1 = buildThreadScrollSignature([base]);
    const sig2 = buildThreadScrollSignature([
      {
        ...base,
        miniCard: {
          title: "t",
          header: "Edited",
          subtitle: "s",
          liveBriefings: [],
          status: "working",
          activity: [],
        },
      },
    ]);
    expect(sig1).not.toBe(sig2);
  });
});