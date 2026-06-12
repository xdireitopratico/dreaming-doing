import { describe, expect, it } from "vitest";
import {
  buildStreamTailFromRows,
  buildTerminalMessageMeta,
  isTerminalAssistantMeta,
  needsTerminalMessagePersist,
  resolveTerminalDisplayText,
} from "./ensure-terminal-message";

describe("needsTerminalMessagePersist", () => {
  it("não exige quando terminal com texto", () => {
    expect(
      needsTerminalMessagePersist({
        parts: [{ type: "text", text: "Pronto." }],
        meta: { partial: false, finishedAt: "2026-06-12T00:00:00Z" },
      }),
    ).toBe(false);
  });

  it("exige para stub partial vazio", () => {
    expect(
      needsTerminalMessagePersist({
        parts: [],
        meta: { partial: true, runId: "r1" },
      }),
    ).toBe(true);
  });
});

describe("resolveTerminalDisplayText", () => {
  it("usa validate_fail quando erro genérico de build fix", () => {
    const text = resolveTerminalDisplayText({
      error: "Corrigindo erros de build…",
      streamRows: [
        {
          event_type: "validate_fail",
          payload: {
            type: "validate_fail",
            feedback: "TS2304: Cannot find name 'foo'",
          },
        },
      ],
    });
    expect(text).toContain("Build não foi concluído");
    expect(text).toContain("TS2304");
  });

  it("prioriza erro explícito não genérico", () => {
    expect(
      resolveTerminalDisplayText({
        error: "NIM: system message invalid",
      }),
    ).toBe("NIM: system message invalid");
  });
});

describe("buildTerminalMessageMeta", () => {
  it("marca terminal com buildFailed", () => {
    const meta = buildTerminalMessageMeta({
      runId: "run-1",
      text: "falhou",
      streamTail: [],
      buildFailed: true,
    });
    expect(isTerminalAssistantMeta(meta)).toBe(true);
    expect(meta.buildFailed).toBe(true);
    expect(meta.lastFinishOk).toBe(false);
  });
});

describe("buildStreamTailFromRows", () => {
  it("inclui validate_fail na timeline", () => {
    const tail = buildStreamTailFromRows([
      { event_type: "validate_fail", payload: { type: "validate_fail", feedback: "x" } },
    ]);
    expect(tail[0]?.type).toBe("validate_fail");
  });
});