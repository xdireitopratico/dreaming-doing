import { describe, expect, it } from "vitest";
import {
  applyAgentProgressEvent,
  initialAgentProgress,
  type SSEEvent,
} from "@/lib/agent-progress";
import {
  resolveTurnThinkingLine,
  shouldFreezeThinkingLine,
} from "@/lib/chat/turn-display";

function ev(type: string, data: Record<string, unknown>, ts = Date.now()): SSEEvent {
  return { type, data, timestamp: ts };
}

describe("resolveTurnThinkingLine", () => {
  it("retorna null em turno clarify-only", () => {
    expect(
      resolveTurnThinkingLine({
        resolved: initialAgentProgress,
        slotActive: true,
        isClarifyOnly: true,
      }),
    ).toEqual({ line: null, frozen: false });
  });

  it("slot ativo sem conteúdo: Pensando…", () => {
    const result = resolveTurnThinkingLine({
      resolved: { ...initialAgentProgress, phase: "build", finished: false },
      slotActive: true,
    });
    expect(result).toEqual({ line: { status: "active" }, frozen: false });
  });

  it("congela com slotActive quando narração chega", () => {
    const result = resolveTurnThinkingLine({
      resolved: {
        ...initialAgentProgress,
        phase: "build",
        finished: false,
        timeline: [ev("thinking_text", { text: "Analisando.", append: true, delta: true })],
      },
      slotActive: true,
      runStartedAtMs: Date.now() - 3200,
      narration: "Vou investigar o estado atual.",
    });
    expect(result.frozen).toBe(true);
    expect(result.line?.status).toBe("done");
    if (result.line?.status === "done") {
      expect(result.line.durationSec).toBeGreaterThanOrEqual(1);
    }
  });

  it("workingDurationMs histórico: Pensou por Xs determinístico", () => {
    const result = resolveTurnThinkingLine({
      resolved: {
        ...initialAgentProgress,
        finished: true,
        workingDurationMs: 4800,
        timeline: [ev("thinking_text", { text: "ok", append: true, delta: true })],
      },
      slotActive: false,
    });
    expect(result.line).toEqual({ status: "done", durationSec: 5 });
    expect(result.frozen).toBe(true);
  });

  it("chat conversacional congela quando streamText chega", () => {
    expect(
      shouldFreezeThinkingLine({
        resolved: { ...initialAgentProgress, conversational: true },
        streamText: "Bom dia!",
      }),
    ).toBe(true);
  });
});