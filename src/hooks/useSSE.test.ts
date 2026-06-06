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
  pendingPlan: null,
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

  it("plan_proposed popula pendingPlan quando runId/projectId presentes", () => {
    const next = applyAgentProgressEvent(
      base,
      ev("plan_proposed", {
        planId: "p-123",
        summary: "Plano de teste",
        steps: [
          { id: "s1", type: "create_file", description: "criar", enabled: true },
        ],
        ttlMs: 60_000,
        runId: "run-1",
        projectId: "proj-1",
      }),
    );
    expect(next.pendingPlan).not.toBeNull();
    expect(next.pendingPlan?.planId).toBe("p-123");
    expect(next.pendingPlan?.steps).toHaveLength(1);
    expect(next.pendingPlan?.runId).toBe("run-1");
    expect(next.pendingPlan?.projectId).toBe("proj-1");
    expect(next.statusHint).toContain("aprovação");
  });

  it("plan_proposed sem runId/projectId não popula pendingPlan", () => {
    const next = applyAgentProgressEvent(
      base,
      ev("plan_proposed", {
        planId: "p-123",
        summary: "Plano",
        steps: [{ id: "s1", type: "custom", description: "x", enabled: true }],
        ttlMs: 60_000,
      }),
    );
    expect(next.pendingPlan).toBeNull();
  });

  it("done com planRejected limpa pendingPlan", () => {
    const withPlan = applyAgentProgressEvent(
      base,
      ev("plan_proposed", {
        planId: "p-1",
        summary: "s",
        steps: [{ id: "s1", type: "custom", description: "x", enabled: true }],
        ttlMs: 60_000,
        runId: "r1",
        projectId: "p1",
      }),
    );
    expect(withPlan.pendingPlan).not.toBeNull();
    const cleared = applyAgentProgressEvent(
      withPlan,
      ev("done", { planRejected: true }),
    );
    expect(cleared.pendingPlan).toBeNull();
  });
});