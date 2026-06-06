import { describe, expect, it } from "vitest";
import { applyAgentProgressEvent } from "@/hooks/useSSE";
import type { AgentProgress, SSEEvent } from "@/hooks/useSSE";

const base: AgentProgress = {
  phase: null,
  message: null,
  currentStep: null,
  totalSteps: null,
  tools: [],
  cost: 0,
  model: null,
  skills: [],
  runtimeChecks: [],
  timeline: [],
  summary: null,
  error: "falhou",
  finished: true,
  resumable: true,
  statusHint: null,
  streamText: null,
  lastFinishOk: null,
  autoResuming: false,
  pendingQueueCount: 0,
  diffs: [],
};

function ev(type: string, data: Record<string, unknown>): SSEEvent {
  return { type, data, timestamp: 0 };
}

describe("applyAgentProgressEvent", () => {
  it("start com resume limpa erro e resumable", () => {
    const next = applyAgentProgressEvent(base, ev("start", { resume: true }));
    expect(next.error).toBeNull();
    expect(next.resumable).toBe(false);
    expect(next.finished).toBe(false);
    expect(next.statusHint).toContain("Retomando");
  });

  it("finish ok encerra sem resumable", () => {
    const next = applyAgentProgressEvent(base, ev("finish", { ok: true, resumable: true }));
    expect(next.finished).toBe(true);
    expect(next.resumable).toBe(false);
    expect(next.error).toBeNull();
  });

  it("finish com falha mantém resumable", () => {
    const next = applyAgentProgressEvent(base, ev("finish", { ok: false, error: "timeout", resumable: true }));
    expect(next.finished).toBe(true);
    expect(next.resumable).toBe(true);
    expect(next.error).toBe("timeout");
  });

  it("error recoverable marca resumable", () => {
    const next = applyAgentProgressEvent(
      { ...base, resumable: false },
      ev("error", { error: "x", recoverable: true }),
    );
    expect(next.resumable).toBe(true);
    expect(next.finished).toBe(true);
  });
});