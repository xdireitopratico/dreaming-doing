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
      error: "",
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

  it("usa texto de preflight quando validate_fail veio do smoke check", () => {
    const text = resolveTerminalDisplayText({
      error: "",
      streamRows: [
        {
          event_type: "validate_fail",
          payload: {
            type: "validate_fail",
            preflight: true,
            feedback: "[build] npm run build failed",
          },
        },
      ],
    });
    expect(text).toContain("Preflight não foi concluído");
    expect(text).toContain("npm run build failed");
  });

  it("prioriza erro explícito não genérico", () => {
    expect(
      resolveTerminalDisplayText({
        error: "NIM: system message invalid",
      }),
    ).toBe("NIM: system message invalid");
  });

  it("usa thinking_text como fallback de terminal quando não há assistant_text final", () => {
    const text = resolveTerminalDisplayText({
      error: "",
      streamRows: [
        {
          event_type: "thinking_text",
          payload: {
            type: "thinking_text",
            text: "Rascunho do raciocínio.",
            delta: true,
          },
        },
      ],
    });
    expect(text).toContain("Rascunho do raciocínio.");
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

  it("preserva contextUsage no cardSnapshot terminal", () => {
    const meta = buildTerminalMessageMeta({
      runId: "run-1",
      text: "ok",
      streamTail: [
        {
          type: "context_usage",
          data: {
            usageTokens: 64000,
            windowTokens: 128000,
            percent: 50,
            mode: "auto",
            compacting: false,
          },
          timestamp: 1,
        },
        {
          type: "context_compact_done",
          data: { afterTokens: 32000, percentAfter: 25, windowTokens: 128000 },
          timestamp: 2,
        },
      ],
    });

    const snap = meta.cardSnapshot as {
      contextUsage?: { percent?: number; windowTokens?: number };
    };
    expect(snap.contextUsage?.percent).toBe(25);
    expect(snap.contextUsage?.windowTokens).toBe(128000);
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
